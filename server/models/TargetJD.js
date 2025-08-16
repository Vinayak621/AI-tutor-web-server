import mongoose from 'mongoose';

const targetJDSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename: { type: String, required: true },
  path: { type: String, required: true },
  resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', required: true },
  uploadedAt: { type: Date, default: Date.now },
});

const TargetJD = mongoose.model('TargetJD', targetJDSchema);
export default TargetJD;
