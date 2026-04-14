import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(cors());

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// DB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"));

// structured memory
const Memory = mongoose.model("Memory", new mongoose.Schema({
  type: String, // people, finance etc
  data: Object,
  rawText: String,
  createdAt: { type: Date, default: Date.now }
}));

let chatHistory = [];

function detectCategory(text) {
  if (text.includes("friend") || text.includes("name")) return "people";
  if (text.includes("money") || text.includes("owe")) return "finance";
  return "notes";
}

app.post("/chat", async (req, res) => {
  const { message, image } = req.body;

  try {
    const memories = await Memory.find().limit(5);

    let userContent = message;

    // 🖼️ IMAGE SUPPORT
    if (image) {
      userContent = [
        { type: "text", text: message },
        {
          type: "image_url",
          image_url: { url: image }
        }
      ];
    }

    chatHistory.push({ role: "user", content: message });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are Wang, a premium futuristic AI assistant.

- Think deeply
- Respond like ChatGPT
- Be structured
- Give suggestions
- Be intelligent and helpful

User memory:
${JSON.stringify(memories)}
`
        },
        ...chatHistory.slice(-6),
        { role: "user", content: userContent }
      ]
    });

    const reply = response.choices[0].message.content;

    // 🧠 SMART MEMORY STORE
    if (message.includes("is my") || message.includes("I am")) {
      await Memory.create({
        type: detectCategory(message),
        data: { text: message },
        rawText: message
      });
    }

    chatHistory.push({ role: "assistant", content: reply });

    res.json({ reply });

  } catch (err) {
    res.json({ reply: "Error: " + err.message });
  }
});

// dashboard
app.get("/memory", async (req, res) => {
  res.json(await Memory.find().sort({ createdAt: -1 }));
});

app.listen(3000, () => console.log("Server running"));
