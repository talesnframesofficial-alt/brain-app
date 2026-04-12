import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json());
app.use(cors());

const MONGO_URI = process.env.MONGO_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ✅ DB
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"))
  .catch(err => console.log(err));

// ✅ Schema
const MemorySchema = new mongoose.Schema({
  category: String,
  content: Object,
  rawText: String,
  createdAt: { type: Date, default: Date.now }
});

const Memory = mongoose.model("Memory", MemorySchema);

// ✅ NEW GEMINI SETUP
const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY
});

// ✅ JSON extractor
function extractJSON(text) {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(text.substring(start, end + 1));
  } catch {
    return null;
  }
}

// 🚀 MAIN ROUTE
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
    // 🧠 Decision
    const decisionRes = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `
Return ONLY JSON:
{
 "action": "store" or "retrieve",
 "category": "",
 "data": {},
 "query": ""
}

User input:
${userMessage}
`
    });

    const decisionText = decisionRes.text;
    const decision = extractJSON(decisionText);

    if (!decision) {
      return res.json({ reply: "Couldn't understand 🤔" });
    }

    // 🟢 STORE
    if (decision.action === "store") {
      await Memory.create({
        category: decision.category,
        content: decision.data,
        rawText: userMessage
      });

      return res.json({ reply: "Saved ✅" });
    }

    // 🔍 RETRIEVE
    if (decision.action === "retrieve") {
      const data = await Memory.find({
        category: decision.category
      }).limit(10);

      const answerRes = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: `
Answer using this data:
${JSON.stringify(data)}

User question:
${userMessage}
`
      });

      return res.json({ reply: answerRes.text });
    }

    res.json({ reply: "Not sure 🤷" });

  } catch (err) {
    console.log(err);
    res.json({ reply: "Error: " + err.message });
  }
});

app.get("/", (req, res) => {
  res.send("AI Brain Running 🚀");
});

app.listen(3000, () => console.log("Server running"));
