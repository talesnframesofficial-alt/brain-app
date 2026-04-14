import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// DB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"));

const Memory = mongoose.model("Memory", new mongoose.Schema({
  category: String,
  content: Object,
  rawText: String,
  createdAt: { type: Date, default: Date.now }
}));

// 🧠 conversation memory (in RAM for now)
let chatHistory = [];

app.post("/chat", async (req, res) => {
  const { message } = req.body;

  try {
    // add memory context
    const pastMemories = await Memory.find().limit(5);

    const systemPrompt = `
You are Wang, a premium AI assistant.

Behave like ChatGPT:
- Understand intent deeply
- Be structured and professional
- Use headings, bullet points
- Give intelligent suggestions

You also have memory:
${JSON.stringify(pastMemories)}
`;

    chatHistory.push({ role: "user", content: message });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...chatHistory.slice(-6) // last messages only
      ]
    });

    const reply = response.choices[0].message.content;

    // 🧠 auto smart storing (simple logic)
    if (message.includes("is my") || message.includes("I am")) {
      await Memory.create({
        category: "people",
        rawText: message,
        content: { text: message }
      });
    }

    chatHistory.push({ role: "assistant", content: reply });

    res.json({ reply });

  } catch (err) {
    res.json({ reply: "Error: " + err.message });
  }
});

// memory API
app.get("/memory", async (req, res) => {
  res.json(await Memory.find().sort({ createdAt: -1 }));
});

app.listen(3000, () => console.log("Server running"));
