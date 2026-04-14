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

// ✅ DB CONNECT
mongoose.connect(process.env.MONGO_URI)
  .then(()=>console.log("MongoDB connected ✅"))
  .catch(err=>console.log(err));

// 🧠 MEMORY MODEL
const Memory = mongoose.model("Memory", new mongoose.Schema({
  type: String,
  title: String,
  details: Object,
  rawText: String,
  createdAt: { type: Date, default: Date.now }
}, { strict:false }));

// 🧠 DETECT SAVE
function isSave(text){
  return /is my|remember|save|add|he is|she is/i.test(text);
}

// 💬 CHAT ROUTE
app.post("/chat", async (req,res)=>{
  const { message } = req.body;

  try{

    // =========================
    // 🧠 SAVE PERSON (REWRITABLE)
    // =========================
    if(isSave(message)){

      const extract = await openai.chat.completions.create({
        model:"gpt-4o-mini",
        messages:[
          {
            role:"system",
            content:`
Extract structured person info.

Return JSON:
{
 "name":"",
 "relation":"",
 "location":"",
 "job":"",
 "notes":""
}
`
          },
          { role:"user", content:message }
        ]
      });

      let parsed;
      try{
        parsed = JSON.parse(extract.choices[0].message.content);
      }catch{
        parsed = {
          name:"Unknown",
          relation:"",
          location:"",
          job:"",
          notes:message
        };
      }

      // 🔄 FIND EXISTING TILE
      let existing = await Memory.findOne({ title: parsed.name });

      if(existing){
        // 🔥 MERGE DATA (NO LOSS)
        existing.details = {
          ...existing.details,
          ...Object.fromEntries(
            Object.entries(parsed).filter(([_,v])=>v && v !== "")
          )
        };

        existing.rawText += " | " + message;

        await existing.save();

      }else{
        // 🆕 CREATE NEW TILE
        await Memory.create({
          type:"people",
          title: parsed.name,
          details: parsed,
          rawText: message
        });
      }

      return res.json({
        reply:{
          title:`🧠 Updated: ${parsed.name}`,
          sections:[{
            heading:"Memory Stored",
            points:[
              parsed.relation,
              parsed.location,
              parsed.job
            ].filter(Boolean),
            image_query:"person profile"
          }]
        }
      });
    }

    // =========================
    // 🧠 RETRIEVE MEMORY
    // =========================
    if(/who|show|tell/i.test(message)){
      const data = await Memory.find().sort({createdAt:-1}).limit(5);

      return res.json({
        reply:{
          title:"🧠 Your Memory",
          sections:data.map(d=>({
            heading:d.title,
            points:[
              d.details.relation,
              d.details.location,
              d.details.job
            ].filter(Boolean),
            image_query:"person"
          }))
        }
      });
    }

    // =========================
    // 🧠 NORMAL CHAT (LIKE CHATGPT)
    // =========================
    const response = await openai.chat.completions.create({
      model:"gpt-4o-mini",
      messages:[
        {
          role:"system",
          content:`
You are Wang AI.

Talk naturally like a human assistant.
Be smart, helpful, and ask questions if unclear.

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
        { role:"user", content:message }
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
            image_query:"ai assistant"
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
          image_query:"ai assistant"
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
          heading:"Something went wrong",
          points:[err.message],
          image_query:"error"
        }]
      }
    });
  }
});

// =========================
// 📂 MEMORY API
// =========================
app.get("/memory", async (req,res)=>{
  try{
    const data = await Memory.find().sort({createdAt:-1});
    res.json(data);
  }catch{
    res.json([]);
  }
});

// =========================
// 🚀 START SERVER
// =========================
app.listen(3000, ()=>{
  console.log("🚀 Wang AI Level 3.5 Running");
});
