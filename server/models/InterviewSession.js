import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
  question: String,
  answer: String,
  responseTime: Date,
  status: { type: String, enum: ["completed", "yet to start"], default: "yet to start" },
});

const interviewSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  resumeId: { type: mongoose.Schema.Types.ObjectId, ref: "Resume", required: true },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  questions: [questionSchema],
  status: { type: String, enum: ["completed", "yet to start"], default: "yet to start" },
  score : {type: Number, default: 0}
});

export default mongoose.model("InterviewSession", interviewSessionSchema);
