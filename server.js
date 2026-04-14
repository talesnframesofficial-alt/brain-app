import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(express.json());
app.use(cors());

const MONGO_URI = process.env.MONGO_URI;
const OPENAI_KEY = process.env.OPENAI_KEY;

// ✅ MongoDB
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

// ✅ OpenAI setup
const openai = new OpenAI({ apiKey: OPENAI_KEY });

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

// 🚀 MAIN API
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
    // 🧠 STEP 1 — Decide
    const decisionRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are a personal brain assistant.

Classify input into:
people, finance, plans, medical, notes

Return ONLY JSON:
{
 "action": "store" or "retrieve",
 "category": "",
 "data": {},
 "query": ""
}
`
        },
        { role: "user", content: userMessage }
      ]
    });

    const decisionText = decisionRes.choices[0].message.content;
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

      return res.json({ reply: "Saved to your brain ✅" });
    }

    // 🔍 RETRIEVE
    if (decision.action === "retrieve") {
      const data = await Memory.find({
        category: decision.category
      }).limit(10);

      const answerRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Answer using this data: ${JSON.stringify(data)}`
          },
          { role: "user", content: userMessage }
        ]
      });

      return res.json({
        reply: answerRes.choices[0].message.content
      });
    }

    res.json({ reply: "Not sure 🤷" });

  } catch (err) {
    console.log(err);
    res.json({ reply: "Error: " + err.message });
  }
});

// ✅ Root
app.get("/", (req, res) => {
  res.send("AI Brain Running 🚀");
});

app.listen(3000, () => console.log("Server running"));
