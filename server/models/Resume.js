import mongoose from 'mongoose';
import { type } from 'os';

const resumeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename: { type: String, required: true },
//   content: { type: String, required: true },
  path:{type: String, required: true},
  status: {
    type: String,
    enum: ["uploaded", "processing", "interview_started", "completed", "error"],
    default: "uploaded",
  },
  uploadedAt: { type: Date, default: Date.now },
});

const Resume = mongoose.model('Resume', resumeSchema);
export default Resume;
