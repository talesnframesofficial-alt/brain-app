import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(express.json());
app.use(cors());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY
});

// ✅ DB CONNECT (UNCHANGED)
mongoose.connect(process.env.MONGO_URI)
  .then(()=>console.log("MongoDB connected ✅"))
  .catch(err=>console.log(err));

// 🧠 MEMORY MODEL (UNCHANGED STRUCTURE)
const Memory = mongoose.model("Memory", new mongoose.Schema({
  type:String,
  title:String,
  details:Object,
  rawText:String,
  createdAt:{ type:Date, default:Date.now }
},{ strict:false }));

// ============================
// 🧠 AUTO MEMORY ENGINE
// ============================
async function autoMemory(message){

  // ❌ DO NOT SAVE QUESTIONS
  const isQuestion = /who|what|where|tell|show|\?/.test(message.toLowerCase());
  if(isQuestion) return;

  const extract = await openai.chat.completions.create({
    model:"gpt-4o-mini",
    messages:[
      {
        role:"system",
        content:`
Extract structured memory.

IMPORTANT:
- Only store meaningful info
- Name must be real person name
- Never return words like "who", "my"

Return JSON:
{
 "type":"people | project | contact | note | none",
 "title":"",
 "details":{
   "name":"",
   "relation":"",
   "location":"",
   "job":"",
   "notes":""
 }
}
If nothing useful → type = "none"
`
      },
      { role:"user", content:message }
    ]
  });

  let parsed;
  try{
    parsed = JSON.parse(extract.choices[0].message.content);
  }catch{
    return;
  }

  if(parsed.type === "none" || !parsed.title) return;

  let existing = await Memory.findOne({
    title:{ $regex: parsed.title, $options:"i" }
  });

  if(existing){
    existing.details = {
      ...(existing.details || {}),
      ...(parsed.details || {})
    };
    existing.rawText += " | " + message;
    await existing.save();
  }else{
    await Memory.create({
      type:parsed.type,
      title:parsed.title,
      details:parsed.details,
      rawText:message
    });
  }
}

// ============================
// 💬 CHAT ROUTE
// ============================
app.post("/chat", async (req,res)=>{
  const { message } = req.body;

  try{

    // 🧠 AUTO MEMORY (SAFE)
    await autoMemory(message);

    // =========================
    // 🧠 BEST FRIEND
    // =========================
    if(message.toLowerCase().includes("best friend")){
      const person = await Memory.findOne({
        "details.relation": { $regex:"best friend", $options:"i" }
      });

      if(!person){
        return res.json({
          reply:{
            title:"Not Found",
            sections:[{
              heading:"Best Friend",
              points:["No data saved yet"]
            }]
          }
        });
      }

      return res.json({
        reply:{
          title:"👤 Your Best Friend",
          sections:[{
            heading:person.title,
            points:[
              person.details.location,
              person.details.job,
              person.details.notes
            ].filter(Boolean)
          }]
        }
      });
    }

    // =========================
    // 🧠 WHO IS
    // =========================
    if(message.toLowerCase().includes("who is")){
      const name = message.split("who is")[1].trim();

      const person = await Memory.findOne({
        title:{ $regex:name, $options:"i" }
      });

      if(!person){
        return res.json({
          reply:{
            title:"Not Found",
            sections:[{
              heading:name,
              points:["No data available"]
            }]
          }
        });
      }

      const d = person.details || {};

      return res.json({
        reply:{
          title:`👤 ${person.title}`,
          sections:[{
            heading:"Details",
            points:[
              d.relation,
              d.location,
              d.job,
              d.notes
            ].filter(Boolean)
          }]
        }
      });
    }

    // =========================
    // 🧠 MEMORY CONTEXT (NEW 🔥)
    // =========================
    const memoryData = await Memory.find().limit(20);

    const memoryContext = memoryData.map(m=>{
      const d = m.details || {};
      return `${m.title}: ${Object.values(d).join(", ")}`;
    }).join("\n");

    // =========================
    // 🧠 NORMAL AI CHAT (MEMORY AWARE)
    // =========================
    const ai = await openai.chat.completions.create({
      model:"gpt-4o-mini",
      messages:[
        {
          role:"system",
          content:`
You are Wang AI.

You HAVE memory of the user.

Memory:
${memoryContext}

Rules:
- Use memory to answer
- Never say "I don’t remember"
- Be natural and helpful

Return JSON:
{
 "title":"",
 "sections":[
  {
   "heading":"",
   "points":[""]
  }
 ]
}
`
        },
        { role:"user", content:message }
      ]
    });

    let raw = ai.choices[0].message.content;

    let reply;
    try{
      reply = JSON.parse(raw);
    }catch{
      reply = {
        title:"Wang AI",
        sections:[{
          heading:"Response",
          points:[raw]
        }]
      };
    }

    res.json({ reply });

  }catch(err){
    console.error(err);

    res.json({
      reply:{
        title:"Error",
        sections:[{
          heading:"Issue",
          points:[err.message]
        }]
      }
    });
  }
});

// ============================
// 📂 MEMORY API
// ============================
app.get("/memory", async (req,res)=>{
  try{
    const data = await Memory.find().sort({createdAt:-1});
    res.json(data);
  }catch{
    res.json([]);
  }
});

// ============================
// 🚀 START
// ============================
app.listen(3000, ()=>{
  console.log("🚀 Wang AI Next-Gen Running");
});
