import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import InterviewSession from "../models/InterviewSession.js";
import Resume from "../models/Resume.js";
import { s3Client } from "../config/s3.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { parse as parseUrl } from "url";
import { streamToBuffer, streamToString } from "../utils/parser.js";
import { openai } from "../utils/openAIClient.js";
import { embedAndStoreResume, getRelevantResumeChunks } from "../utils/vectorUtils.js";
import PdfParse from "pdf-parse";

const resumeCache = new Map();
const sessionMap = new Map();

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", async (ws, req) => {
    const token = req.headers.cookie?.split("token=")[1]?.split(";")[0];
    if (!token) return ws.close();

    let user;
    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return ws.close();
    }

    const { resumeId } = parseUrl(req.url, true).query;
    if (!resumeId) return ws.close();

    let resumeContent = "";
    try {
      if (resumeCache.has(resumeId)) {
        resumeContent = resumeCache.get(resumeId).content;
      } else {
        const resume = await Resume.findById(resumeId);
        if (!resume?.path) return ws.close();

        const command = new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: resume.path,
        });

        const response = await s3Client.send(command);
        resumeContent = await streamToBuffer(response.Body);
        resumeContent = await PdfParse(resumeContent).then(data => data.text.trim());
        // resumeCache.set(resumeId, { content: resumeContent });
      }
    } catch (err) {
      console.error("❌ Failed to fetch resume:", err);
      return ws.close();
    }

    if (!resumeCache.get(resumeId)?.embedded) {
      try {
        await embedAndStoreResume(resumeId, resumeContent);
        // resumeCache.get(resumeId).embedded = true;
      } catch (err) {
        console.error("❌ Embedding failed:", err);
        return ws.close();
      }
    }

    const interview = new InterviewSession({
      userId: user.userId,
      resumeId,
      questions: [],
    });
    await interview.save();

    const questionPlan = [
      { label: "general", prompt: "Ask a general interview question like 'Tell me about yourself'." },
      { label: "skills_medium", prompt: "Ask a medium-level technical question based on the candidate's skills." },
      { label: "skills_hard", prompt: "Ask a hard-level technical question based on the candidate's skills and do not reveal any answer." },
      { label: "projects_medium", prompt: "Ask a medium-level question about one of the candidate's projects." },
      { label: "out_of_box", prompt: "Ask an out-of-the-box or situational question to test creativity or thinking." },
    ];

    sessionMap.set(ws, {
      index: 0,
      interview,
      resumeId,
      questionPlan,
      scores: [],
    });

    ws.send(JSON.stringify({
      type: "system",
      data: "Hello! I’m your AI Interviewer. Let’s get started!",
    }));

    askNextQuestion(ws);

    ws.on("message", async (msg) => {
      const session = sessionMap.get(ws);
      if (!session) return;

      const { index, interview, questionPlan, scores } = session;

      const userAnswer = JSON.parse(msg).data;
      const lastQuestion = interview.questions[index - 1]?.question;

      // Evaluate answer
      const evalRes = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are an expert interviewer. Evaluate the answer from 0 to 10." },
          { role: "user", content: `Q: ${lastQuestion}\nA: ${userAnswer}\nRate the answer and explain briefly.` }
        ]
      });

      const evaluation = evalRes.choices[0].message.content;
      scores.push(evaluation);

      interview.questions[index - 1].answer = userAnswer;
      interview.questions[index - 1].evaluation = evaluation;
      await interview.save();

      askNextQuestion(ws);
    });

    ws.on("close", () => {
      sessionMap.delete(ws);
    });
  });
}

async function askNextQuestion(ws) {
  const session = sessionMap.get(ws);
  if (!session) return;

  const { index, resumeId, questionPlan, interview, scores } = session;

  if (index >= questionPlan.length) {
    const averageScore = computeAverageScore(scores);
    interview.status = "completed";
    interview.score = averageScore;
    await interview.save();

    ws.send(JSON.stringify({
      type: "system",
      data: `🎓 Interview completed! Your average score is: ${averageScore.toFixed(1)}/10`,
    }));
    ws.send(JSON.stringify({ type: "done" }));
    ws.close();
    return;
  }

  const { prompt } = questionPlan[index];
  try {
    const context = await getRelevantResumeChunks(resumeId, prompt);
    const gptResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a professional AI interviewer." },
        { role: "user", content: `Resume:\n${context}\n\n${prompt}` },
      ],
    });

    const question = gptResponse.choices[0].message.content;
    ws.send(JSON.stringify({ type: "question", data: question }));

    interview.questions.push({ question });
    await interview.save();

    session.index++;
  } catch (err) {
    console.error("❌ Failed to generate question:", err);
    ws.send(JSON.stringify({ type: "error", data: "Question generation failed." }));
    ws.close();
  }
}

function computeAverageScore(scores) {
  const nums = scores.map(s => {
    const match = s.match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[0]) : 0;
  });
  const total = nums.reduce((acc, n) => acc + n, 0);
  return total / (nums.length || 1);
}
