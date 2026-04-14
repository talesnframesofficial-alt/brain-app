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

// 🧠 MEMORY MODEL
const Memory = mongoose.model("Memory", new mongoose.Schema({
  type: String,
  title: String,
  details: Object,
  rawText: String,
  createdAt: { type: Date, default: Date.now }
}, { strict:false }));

let chatHistory = [];

// 🧠 INTENT
function detectIntent(text){
  if(/remember|save|store|add/i.test(text)) return "save";
  if(/who|what|show|tell|find/i.test(text)) return "retrieve";
  return "chat";
}

// 🧠 TYPE
function detectType(text){
  if(/friend|father|mother|name|person/i.test(text)) return "people";
  if(/money|salary|debt/i.test(text)) return "finance";
  if(/trip|plan|travel/i.test(text)) return "plans";
  return "notes";
}

// 💬 CHAT
app.post("/chat", async (req,res)=>{
  const { message } = req.body;

  try{
    const intent = detectIntent(message);
    const type = detectType(message);

    // 🧠 SAVE
    if(intent === "save"){
      await Memory.create({
        type,
        title: message.slice(0,40),
        details:{text:message},
        rawText: message
      });

      return res.json({
        reply:{
          title:"🧠 Saved",
          sections:[{
            heading:"Memory stored",
            points:[message],
            image_query:"database"
          }]
        }
      });
    }

    // 🧠 RETRIEVE
    if(intent === "retrieve"){
      const data = await Memory.find().sort({createdAt:-1}).limit(5);

      return res.json({
        reply:{
          title:"🧠 Your Memory",
          sections:data.map(d=>({
            heading:d.type,
            points:[d.rawText],
            image_query:d.type
          }))
        }
      });
    }

    // 🧠 NORMAL CHAT
    const response = await openai.chat.completions.create({
      model:"gpt-4o-mini",
      messages:[
        {
          role:"system",
          content:`
You are Wang AI.

Talk naturally like a smart assistant.
Ask questions if needed.

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
`
        },
        ...chatHistory.slice(-5),
        {role:"user", content:message}
      ]
    });

    let raw = response.choices[0].message.content;

    let reply;

    try{
      const parsed = JSON.parse(raw);

      if(!parsed.title || !parsed.sections){
        reply = {
          title:"Wang AI",
          sections:[{
            heading:"Response",
            points:[parsed.response || raw],
            image_query:"ai"
          }]
        };
      } else {
        reply = parsed;
      }

    }catch{
      reply = {
        title:"Wang AI",
        sections:[{
          heading:"Response",
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

// MEMORY API
app.get("/memory", async (req,res)=>{
  const data = await Memory.find().sort({createdAt:-1});
  res.json(data);
});

app.listen(3000, ()=>console.log("🚀 Wang AI Running"));
