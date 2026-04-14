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

mongoose.connect(process.env.MONGO_URI)
  .then(()=>console.log("MongoDB connected ✅"));

// 🧠 MEMORY MODEL
const Memory = mongoose.model("Memory", new mongoose.Schema({
  type:String, // people, contacts, projects, notes
  title:String,
  details:Object,
  rawText:String,
  createdAt:{ type:Date, default:Date.now }
},{ strict:false }));

// ============================
// 🧠 AUTO MEMORY ENGINE
// ============================
async function autoMemory(message){

  const extract = await openai.chat.completions.create({
    model:"gpt-4o-mini",
    messages:[
      {
        role:"system",
        content:`
Analyze message and extract structured memory.

Return JSON:

{
 "type":"people | contact | project | note | none",
 "title":"",
 "details":{
   "name":"",
   "relation":"",
   "phone":"",
   "location":"",
   "job":"",
   "project":"",
   "notes":""
 }
}

If nothing important → type = "none"
`
      },
      { role:"user", content:message }
    ]
  });

  let parsed;
  try{
    parsed = JSON.parse(extract.choices[0].message.content);
  }catch{
    return null;
  }

  if(parsed.type === "none") return null;

  // 🔄 FIND EXISTING
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

    // 🧠 AUTO MEMORY (ALWAYS RUNS)
    await autoMemory(message);

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
            points:Object.values(d).filter(Boolean)
          }]
        }
      });
    }

    // =========================
    // 🧠 SHOW MEMORY
    // =========================
    if(/show|tell/i.test(message)){
      const data = await Memory.find().limit(10);

      return res.json({
        reply:{
          title:"🧠 Memory",
          sections:data.map(d=>({
            heading:d.title,
            points:Object.values(d.details || {}).filter(Boolean)
          }))
        }
      });
    }

    // =========================
    // 🧠 NORMAL AI CHAT
    // =========================
    const ai = await openai.chat.completions.create({
      model:"gpt-4o-mini",
      messages:[
        {
          role:"system",
          content:`
You are Wang AI.

Talk like a human assistant.
Be smart, natural, and helpful.

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
  const data = await Memory.find().sort({createdAt:-1});
  res.json(data);
});

app.listen(3000, ()=>console.log("🚀 Next-Gen AI Running"));
