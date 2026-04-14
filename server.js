import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY
});

// DB
mongoose.connect(process.env.MONGO_URI)
  .then(()=>console.log("MongoDB connected ✅"));

// 🧠 MEMORY MODEL (ADVANCED)
const Memory = mongoose.model("Memory", new mongoose.Schema({
  type: String,
  title: String,
  details: Object,
  rawText: String,
  createdAt: { type: Date, default: Date.now }
}, { strict:false }));

let chatHistory = [];

// 🧠 INTENT DETECTION
function detectIntent(text){
  if(/remember|save|store|note/i.test(text)) return "save";
  if(/who|what|show|tell|find/i.test(text)) return "retrieve";
  return "chat";
}

// 🧠 CATEGORY
function detectType(text){
  if(/friend|father|mother|person|name/i.test(text)) return "people";
  if(/money|salary|debt|income/i.test(text)) return "finance";
  if(/plan|trip|travel/i.test(text)) return "plans";
  return "notes";
}

app.post("/chat", async (req,res)=>{
  const { message } = req.body;

  try{
    const intent = detectIntent(message);
    const type = detectType(message);

    // 🧠 SAVE (SMART STRUCTURE)
    if(intent === "save"){
      const extract = await openai.chat.completions.create({
        model:"gpt-4o-mini",
        messages:[{
          role:"system",
          content:`
Extract structured data.

Return JSON:
{
 "title":"",
 "details":{
   "name":"",
   "relation":"",
   "notes":""
 }
}
`
        },
        {role:"user", content:message}]
      });

      let parsed;
      try{
        parsed = JSON.parse(extract.choices[0].message.content);
      }catch{
        parsed = { title:"Note", details:{ text:message }};
      }

      await Memory.create({
        type,
        title: parsed.title,
        details: parsed.details,
        rawText: message
      });

      return res.json({
        reply:{
          title:"🧠 Memory Saved",
          sections:[{
            heading:"Stored Successfully",
            points:[`Saved under ${type}`],
            image_query:"database"
          }]
        }
      });
    }

    // 🧠 RETRIEVE (SMART)
    if(intent === "retrieve"){
      const data = await Memory.find().sort({createdAt:-1}).limit(10);

      return res.json({
        reply:{
          title:"🧠 Memory Results",
          sections:data.map(d=>({
            heading:d.title || d.type,
            points:[d.rawText],
            image_query:d.type
          }))
        }
      });
    }

    // 🧠 CHAT (LIKE ME)
    const response = await openai.chat.completions.create({
      model:"gpt-4o-mini",
      messages:[
        {
          role:"system",
          content:`
You are Wang AI.

Behave like ChatGPT:
- Understand deeply
- Ask questions if unclear
- Give suggestions
- Be natural, not robotic
- Keep answers structured

Return JSON only.
`
        },
        ...chatHistory.slice(-6),
        {role:"user", content:message}
      ]
    });

    let raw = response.choices[0].message.content;

    let reply;
    try{
      reply = JSON.parse(raw);
    }catch{
      reply = {
        title:"Response",
        sections:[{
          heading:"AI",
          points:[raw],
          image_query:"ai"
        }]
      };
    }

    chatHistory.push({role:"user", content:message});

    res.json({ reply });

  }catch(err){
    res.json({
      reply:{
        title:"Error",
        sections:[{
          heading:"Issue",
          points:[err.message],
          image_query:"error"
        }]
      }
    });
  }
});

app.get("/memory", async (req,res)=>{
  const data = await Memory.find().sort({createdAt:-1});
  res.json(data);
});

app.listen(3000, ()=>console.log("🚀 Level 3 AI Running"));
