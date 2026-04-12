import express from "express";
import mongoose from "mongoose";
import OpenAI from "openai";

const app = express();
app.use(express.json());

// 🔴 REPLACE THESE
const MONGO_URI = "YOUR_MONGODB_URL";
const OPENAI_KEY = "YOUR_OPENAI_KEY";

mongoose.connect(MONGO_URI);

const MemorySchema = new mongoose.Schema({
  category: String,
  content: Object,
  rawText: String,
  createdAt: { type: Date, default: Date.now }
});

const Memory = mongoose.model("Memory", MemorySchema);

const openai = new OpenAI({ apiKey: OPENAI_KEY });

app.get("/", (req, res) => {
  res.send("AI Brain Running 🚀");
});

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
    const aiDecision = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Classify input into: people, finance, plans, medical, notes.
Return JSON:
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

    const decision = JSON.parse(aiDecision.choices[0].message.content);

    if (decision.action === "store") {
      await Memory.create({
        category: decision.category,
        content: decision.data,
        rawText: userMessage
      });

      return res.json({ reply: "Saved ✅" });
    }

    if (decision.action === "retrieve") {
      const data = await Memory.find({ category: decision.category });

      const aiReply = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Answer using: ${JSON.stringify(data)}`
          },
          { role: "user", content: userMessage }
        ]
      });

      return res.json({
        reply: aiReply.choices[0].message.content
      });
    }

    res.json({ reply: "Didn't understand" });

  } catch (err) {
    res.json({ reply: "Error" });
  }
});

app.listen(3000, () => console.log("Server running"));
