import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(express.json());
app.use(cors());

// ✅ ENV VARIABLES
const MONGO_URI = process.env.MONGO_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ✅ CONNECT DB
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"))
  .catch(err => console.log(err));

// ✅ MEMORY SCHEMA
const MemorySchema = new mongoose.Schema({
  category: String,
  content: Object,
  rawText: String,
  createdAt: { type: Date, default: Date.now }
});

const Memory = mongoose.model("Memory", MemorySchema);

// ✅ GEMINI SETUP
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });

// 🧠 Helper function (handles messy AI response)
function extractJSON(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// 🚀 MAIN ROUTE
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
    // 🧠 STEP 1: Decide action
    const decisionText = await model.generateContent(`
You are a personal brain assistant.

Classify the input into:
people, finance, plans, medical, notes

Return ONLY JSON:
{
 "action": "store" or "retrieve",
 "category": "",
 "data": {},
 "query": ""
}

User input:
"${userMessage}"
`);

    const decision = extractJSON(decisionText.response.text());

    if (!decision) {
      return res.json({ reply: "Couldn't understand properly" });
    }

    // 🟢 STORE
    if (decision.action === "store") {
      await Memory.create({
        category: decision.category,
        content: decision.data,
        rawText: userMessage
      });

      return res.json({ reply: "Saved to your brain ✅" });
    }

    // 🔍 RETRIEVE
    if (decision.action === "retrieve") {
      const data = await Memory.find({
        category: decision.category
      }).limit(10);

      const answerText = await model.generateContent(`
You are a smart personal assistant.

Answer the user based on this data:
${JSON.stringify(data)}

User question:
"${userMessage}"
`);

      return res.json({
        reply: answerText.response.text()
      });
    }

    res.json({ reply: "Not sure what to do" });

  } catch (err) {
    console.log(err);
    res.json({ reply: "Error occurred" });
  }
});

// 🧪 TEST ROUTE
app.get("/", (req, res) => {
  res.send("AI Brain Running 🚀");
});

// 🚀 START SERVER
app.listen(3000, () => console.log("Server running"));
