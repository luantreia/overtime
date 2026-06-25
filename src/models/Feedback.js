import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const FeedbackSchema = new Schema({
  message: { type: String, required: true, maxlength: 1000 },
  tipo: { type: String, enum: ['sugerencia', 'bug', 'pregunta', 'otro'], default: 'sugerencia' },
  page: { type: String, maxlength: 200 },
  userUid: { type: String },
  userName: { type: String },
}, { timestamps: true });

export default model('Feedback', FeedbackSchema);
