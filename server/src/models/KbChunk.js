import mongoose from 'mongoose';

const { Schema } = mongoose;

// One chunk per `##` section. `title` is denormalized from the parent document
// so the weighted text index can rank title > heading > body.
const kbChunkSchema = new Schema(
  {
    chunk_id: { type: String, required: true, unique: true },
    doc_id: { type: String, required: true, index: true },
    title: String, // parent document title (denormalized)
    heading: String,
    text: String,
    trust_level: { type: String, enum: ['trusted', 'untrusted'], default: 'trusted' },
  },
  { collection: 'kb_chunks' },
);

// MongoDB allows one text index per collection. Weights: title 5, heading 3, text 1.
kbChunkSchema.index(
  { title: 'text', heading: 'text', text: 'text' },
  { weights: { title: 5, heading: 3, text: 1 }, name: 'kb_chunk_text' },
);

export default mongoose.models.KbChunk || mongoose.model('KbChunk', kbChunkSchema);
