import express from "express";
import multer from "multer";
import multerS3 from "multer-s3";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { authenticate } from "../middleware/auth.js";
import Resume from "../models/Resume.js";
import InterviewSession from "../models/InterviewSession.js";
import { s3Client } from "../config/s3.js";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { embedAndStoreResumeContent } from "../utils/vectorUtils.js";
import { streamToBuffer } from "../utils/parser.js";
import PdfParse from "pdf-parse";

const router = express.Router();

const upload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: process.env.AWS_S3_BUCKET,
    acl: "private",
    key: (req, file, cb) => {
      cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files allowed"), false);
    }
    cb(null, true);
  },
});

router.post("/upload", authenticate, upload.single("resume"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No PDF uploaded" });

  try {

    const resume_exists = await Resume.findOne({ filename: req.file.originalname, user: req.user.userId });

    if (resume_exists) {
      const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: resume_exists.path,
      });
      console.log("resume_exists._id",resume_exists._id);

      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

      return res.status(200).json({
        message: "Resume already exists, using existing file",
        resumeId: resume_exists._id,
        fileUrl: signedUrl,
      });
    }
  

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: req.file.key,
    });

    const response = await s3Client.send(command);
    const buffer = await streamToBuffer(response.Body);
    
    let jobDescriptionText = "";
    if (req.file.mimetype === "application/pdf") {
      jobDescriptionText = (await PdfParse(buffer)).text.trim();
    } else {
      jobDescriptionText = buffer.toString("utf-8").trim();
    }

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    const resume = new Resume({
      user: req.user.userId,
      filename: req.file.originalname,
      path: req.file.key,
      status: "uploaded",
    });

    await resume.save();

    await embedAndStoreResumeContent(resume._id, jobDescriptionText);

    res.status(201).json({
      message: "Resume uploaded",
      resumeId: resume._id,
      fileUrl: signedUrl,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Failed to upload resume" });
  }
});

router.get("/my-resumes", authenticate, async (req, res) => {
  try {
    const resumes = await Resume.find({ user: req.user.userId })
      .populate("user", "name")
      .sort({ uploadedAt: -1 });


    const result = resumes.map((resume) => ({
        id:resume._id,
      username: resume.user?.name || "Unknown",
      date: resume.uploadedAt,
      resumeName: resume.filename,
      status: resume.status,
    }));

    res.status(200).json(result);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ message: "Error fetching resumes" });
  }
});

router.delete("/my-resumes/:id", authenticate, async (req, res) => {
  const resumeId = (req.params.id);

  try {
    const resume = await Resume.findOne({ _id: resumeId, user: req.user.userId });
    if (!resume) {
      return res.status(404).json({ message: "Resume not found" });
    }

    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: resume.path,
    });

    await s3Client.send(deleteCommand);
    
    await Resume.deleteOne({ _id: resumeId });

    res.status(200).json({ message: "Resume deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Failed to delete resume" });
  }
});

router.get("/interview/completed", authenticate, async (req, res) => {
  try {
    const sessions = await InterviewSession.find({
      userId: req.user.userId,
      status: "completed",
    })
      .select("resumeId questions completedAt startedAt score")
      .populate("resumeId", "filename");

    const groupedByResume = {};

    for (const session of sessions) {
      const resumeId = session.resumeId?._id?.toString() || "unknown";
      const resumeName = session.resumeId?.filename || "Unknown";

      if (!groupedByResume[resumeId]) {
        groupedByResume[resumeId] = {
          resumeId,
          resumeName,
          sessions: [],
        };
      }

      groupedByResume[resumeId].sessions.push({
        sessionId: session._id,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        questions: session.questions.map(q => ({
          question: q.question,
          answer: q.answer,
          responseTime: q.responseTime,
          status: q.status,
        })),
        score: session.score,
      });
    }

    res.status(200).json(Object.values(groupedByResume));
  } catch (err) {
    console.error("Error fetching grouped sessions:", err);
    res.status(500).json({ message: "Failed to retrieve completed sessions" });
  }
});

router.get("/interview/session/:id", authenticate, async (req, res) => {

  try {
    const { id } = req.params;

  
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid session ID format" });
    }

    const session = await InterviewSession.findOne({
      _id: id,
      userId: req.user.userId,
      status: "completed"
    })
      .select("resumeId questions completedAt startedAt score status")
      .populate("resumeId", "filename");

    if (!session) {
      return res.status(404).json({ message: "Interview session not found" });
    }

    const sessionDetails = {
      _id: session._id,
      sessionId: session._id,
      resumeId: session.resumeId?._id?.toString() || "unknown",
      resumeName: session.resumeId?.filename || "Unknown",
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      score: session.score,
      status: session.status,
      questions: session.questions.map(q => ({
        question: q.question,
        answer: q.answer,
        responseTime: q.responseTime,
        status: q.status,
      }))
    };

    res.status(200).json(sessionDetails);
  } catch (err) {
    console.error("Error fetching session details:", err);
    res.status(500).json({ message: "Failed to retrieve session details" });
  }
});


router.delete("/interview-session/:id",authenticate, async (req,res)=> {
  const sessionId = req.params.id;
  try {
    await InterviewSession.deleteOne({ _id: sessionId });
    res.status(200).json({ message: "Session deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Failed to delete resume" });
  }
})

export default router;
