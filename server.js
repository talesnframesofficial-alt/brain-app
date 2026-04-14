import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"));

const Memory = mongoose.model("Memory", new mongoose.Schema({
  type: String,
  data: Object,
  rawText: String,
  createdAt: { type: Date, default: Date.now }
}));

let chatHistory = [];

app.post("/chat", async (req, res) => {
  const { message } = req.body;

  try {
    chatHistory.push({ role: "user", content: message });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are Wang, a premium AI assistant.

IMPORTANT:
- Always return response in JSON format ONLY

FORMAT:
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
- Keep answers clean and professional
- 3–4 sections max
- Each section must have an image_query
- Do NOT return plain text
`
        },
        ...chatHistory.slice(-6)
      ]
    });

    let raw = response.choices[0].message.content;

    let reply;
    try {
      reply = JSON.parse(raw);
    } catch {
      reply = {
        title: "Response",
        sections: [
          {
            heading: "",
            points: [raw],
            image_query: "technology"
          }
        ]
      };
    }

    res.json({ reply });

  } catch (err) {
    res.json({ reply: { title: "Error", sections: [{ heading: "", points: [err.message] }] } });
  }
});

app.listen(3000, () => console.log("Server running"));
