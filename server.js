import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());

// 🔐 OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY
});

// 🧠 MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"))
  .catch(err => console.log("DB Error:", err));

// 🧠 Memory Schema (SAFE)
const Memory = mongoose.model("Memory", new mongoose.Schema({
  type: String,
  data: Object,
  rawText: String,
  createdAt: { type: Date, default: Date.now }
}, { strict: false }));

// 🧠 Detect category
function detectType(text) {
  if (/friend|father|mother|brother|sister|contact/i.test(text)) return "people";
  if (/money|owe|salary|income|debt/i.test(text)) return "finance";
  if (/plan|trip|travel|visit/i.test(text)) return "plans";
  return "notes";
}

// 🧠 Chat memory (short-term)
let chatHistory = [];

// 💬 CHAT ROUTE
app.post("/chat", async (req, res) => {
  const { message } = req.body;

  try {
    if (!message) {
      return res.json({
        reply: {
          title: "⚠️ Input Missing",
          sections: [{
            heading: "No message received",
            points: ["Please type something to continue."],
            image_query: "warning"
          }]
        }
      });
    }

    // 🧠 Load recent memory
    const memories = await Memory.find().sort({ createdAt: -1 }).limit(5);

    // 🧠 Build system prompt (PERSONALITY)
    const systemPrompt = `
You are Wang — a highly intelligent, friendly, and professional AI assistant.

PERSONALITY:
- Talk like a smart human (natural, not robotic)
- Be slightly casual but respectful
- Think before answering
- If unclear → ASK a question
- If multiple options → suggest best ones
- Be helpful, not just informative

BEHAVIOR:
- Understand user intent deeply
- If user says something vague → ask clarification
- If user asks for suggestions → give 2-4 good options
- If user shares personal info → remember it

MEMORY CONTEXT:
${JSON.stringify(memories)}

RESPONSE FORMAT (VERY IMPORTANT):
Return ONLY JSON:

{
 "title": "",
 "sections": [
   {
     "heading": "",
     "points": ["", ""],
     "image_query": ""
   }
 ]
}

RULES:
- Clean formatting
- No long paragraphs
- Max 3–4 sections
- Always helpful
`;

    // 🧠 Add conversation memory
    chatHistory.push({ role: "user", content: message });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...chatHistory.slice(-6)
      ]
    });

    let raw = response.choices[0].message.content;

    // 🧠 Parse safely
    let reply;
    try {
      reply = JSON.parse(raw);
    } catch (e) {
      reply = {
        title: "Response",
        sections: [{
          heading: "AI Reply",
          points: [raw],
          image_query: "technology"
        }]
      };
    }

    // 🧠 Save important memory
    if (/is my|I am|my name|my friend|I have/i.test(message)) {
      await Memory.create({
        type: detectType(message),
        rawText: message,
        data: { text: message }
      });
    }

    // 🧠 Store assistant reply in short-term memory
    chatHistory.push({
      role: "assistant",
      content: raw
    });

    res.json({ reply });

  } catch (err) {
    console.error(err);

    res.json({
      reply: {
        title: "❌ Error",
        sections: [{
          heading: "Something went wrong",
          points: [err.message],
          image_query: "error"
        }]
      }
    });
  }
});

// 📂 MEMORY API
app.get("/memory", async (req, res) => {
  try {
    const data = await Memory.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.json([]);
  }
});

// 🚀 START SERVER
app.listen(3000, () => {
  console.log("🚀 Wang AI Server Running");
});
