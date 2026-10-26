import mongoose from 'mongoose';

const { Schema } = mongoose;

// trust_level comes from the document's Audience line at ingest (provenance),
// never from scanning its text. 'untrusted' marks KB-ADVERSARIAL-001.
const knowledgeDocumentSchema = new Schema(
  {
    doc_id: { type: String, required: true, unique: true },
    title: String,
    audience: String,
    version: String,
    trust_level: { type: String, enum: ['trusted', 'untrusted'], default: 'trusted' },
    checksum: String, // sha256 of content
    source_path: String,
    content: String,
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'knowledge_documents' },
);

export default mongoose.models.KnowledgeDocument ||
  mongoose.model('KnowledgeDocument', knowledgeDocumentSchema);
