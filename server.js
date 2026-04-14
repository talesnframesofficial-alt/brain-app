import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// ✅ SAFE DB (NO DATA LOSS)
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"));

// ✅ FLEXIBLE MEMORY
const Memory = mongoose.model("Memory", new mongoose.Schema({
  type: String,
  data: Object,
  rawText: String,
  createdAt: { type: Date, default: Date.now }
}, { strict: false }));

let chatHistory = [];

// 🧠 DETECT TYPE
function detectType(text){
  if(/friend|father|mother|brother|sister/i.test(text)) return "people";
  if(/money|owe|salary|income/i.test(text)) return "finance";
  if(/plan|trip|travel/i.test(text)) return "plans";
  return "notes";
}

// 💬 CHAT
app.post("/chat", async (req, res) => {
  const { message } = req.body;

  try {
    chatHistory.push({ role:"user", content:message });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role:"system",
          content:`
You are Wang AI.

Return ONLY JSON:

{
 "title":"",
 "sections":[
  {
   "heading":"",
   "points":["",""],
   "image_query":""
  }
 ]
}

Make responses clean and structured.
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
        title:"Response",
        sections:[{
          heading:"",
          points:[raw],
          image_query:"technology"
        }]
      };
    }

    // 🧠 STORE MEMORY
    if(/is my|I am|my name/i.test(message)){
      await Memory.create({
        type: detectType(message),
        rawText: message,
        data:{text:message}
      });
    }

    res.json({ reply });

  } catch(err){
    res.json({ reply:{
      title:"Error",
      sections:[{heading:"",points:[err.message]}]
    }});
  }
});

// 📂 MEMORY API
app.get("/memory", async (req,res)=>{
  const data = await Memory.find().sort({createdAt:-1});
  res.json(data);
});

app.listen(3000, ()=>console.log("Server running 🚀"));
