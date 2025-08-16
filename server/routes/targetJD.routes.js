import express from "express";
import multer from "multer";
import multerS3 from "multer-s3";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { authenticate } from "../middleware/auth.js";
import TargetJD from "../models/TargetJD.js";
import { s3Client } from "../config/s3.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { embedAndStoreJD, generateResumeSuggestions } from "../utils/vectorUtils.js";
import { streamToBuffer } from "../utils/parser.js";
import PdfParse from "pdf-parse";
import { extname } from "path";
import mammoth from "mammoth";
import { embedJDQueue } from "../queues/embedJDQueue.js";
import { cosineSimilarity } from "../utils/similarity.js";
import { getPineconeIndex, getTargetJDIndex } from "../config/pinceconeClient.js";
import { Job } from "bullmq";


const router = express.Router();

const jdUpload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: process.env.AWS_S3_BUCKET,
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      const uniqueName = ` ${uuidv4()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  }),
});

router.post("/upload-jd", authenticate, jdUpload.single("jobDescription"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No JD uploaded" });

  const { resumeId } = req.body;
  if (!resumeId) return res.status(400).json({ message: "Missing resumeId" });

  try {
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

    const jd = new TargetJD({
      user: req.user.userId,
      filename: req.file.originalname,
      path: req.file.key,
      resumeId,
    });

    await jd.save();

    const job = await embedJDQueue.add("embedJD", {
       jd: jd._id,
        text: jobDescriptionText,
    });

    res.status(201).json({
      message: "JD uploaded and embedding scheduled",
      jdId: jd._id,
      jobId: job.id,
    });
  } catch (err) {
    console.error("JD Upload error:", err);
    res.status(500).json({ message: "Failed to upload JD" });
  }
});

router.post("/confidence-score", authenticate,async (req, res) => {
  const { resumeId, jdId } = req.body;

  if (!resumeId || !jdId) {
    return res.status(400).json({ message: "Missing resumeId or jdId" });
  }
  let bulletinPoints=[];
  let goodVerdict="";

  try {
    const index1 = await getPineconeIndex();
    const index2 = await getTargetJDIndex();
    const vectorId = jdId.startsWith("jd-") ? jdId : `jd-${jdId}`;

    const [resumeVector, jdVector] = await Promise.all([
      index1.fetch([`resume-${resumeId}`]),
      index2.fetch([vectorId])
    ]);

    console.log("resumeVector", resumeVector);
    console.log("jdVector", jdVector);

    const resumeEmbedding = resumeVector.records[`resume-${resumeId}`];
    const jdEmbedding = jdVector.records[`jd-${jdId}`];


    if (!resumeEmbedding || !jdEmbedding) {
      return res.status(404).json({ message: "Embeddings not found" });
    }

    const score = cosineSimilarity(resumeEmbedding.values, jdEmbedding.values);
    console.log("score", score);

    if(score==1) {
      goodVerdict="The resumne is good enough for the required job description";
    }

    else {
      let jobDescriptionText = jdEmbedding.metadata.jobDescriptionText;
      let resumeText = resumeEmbedding.metadata.resumeText;
      bulletinPoints = await generateResumeSuggestions(jobDescriptionText, resumeText);
    }

    res.json({
      resumeId,
      jdId,
      confidenceScore: Number(score.toFixed(4)),
      goodVerdict,
      bulletinPoints
    });

  } catch (err) {
    console.error("Confidence score error:", err);
    res.status(500).json({ message: "Failed to compute confidence score" });
  }
});

router.get("/job-status/:jobId", authenticate,async (req, res) => {
  try {
    const job = await Job.fromId(embedJDQueue, req.params.jobId);
    if (!job) return res.status(404).json({ status: "not_found" });

    const state = await job.getState();
    res.json({ status: state });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error" });
  }
});

export default router;
