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

// 🧠 MODEL
const Memory = mongoose.model("Memory", new mongoose.Schema({
  type:String,
  title:String,
  details:Object,
  rawText:String,
  createdAt:{ type:Date, default:Date.now }
},{ strict:false }));

// 🧠 SAVE DETECTOR
function isSave(text){
  return /is my|he is|she is|remember|add/i.test(text);
}

app.post("/chat", async (req,res)=>{
  const { message } = req.body;

  try{

    // =========================
    // 🧠 SAVE (REWRITABLE)
    // =========================
    if(isSave(message)){

      const extract = await openai.chat.completions.create({
        model:"gpt-4o-mini",
        messages:[
          {
            role:"system",
            content:`
Extract person info.

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
          name: message.split(" ")[0],
          notes: message
        };
      }

      let existing = await Memory.findOne({
        title:{ $regex: parsed.name, $options:"i" }
      });

      if(existing){
        existing.details = {
          ...(existing.details || {}),
          ...parsed
        };
        existing.rawText += " | " + message;
        await existing.save();
      }else{
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
            heading:"Memory Saved",
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
    // 🧠 WHO IS (SMART SEARCH)
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
              points:["No data available"],
              image_query:"search"
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
            ].filter(Boolean),
            image_query:"person"
          }]
        }
      });
    }

    // =========================
    // 🧠 GENERAL RETRIEVE
    // =========================
    if(/show|tell/i.test(message)){
      const data = await Memory.find().limit(10);

      return res.json({
        reply:{
          title:"🧠 Memory",
          sections:data.map(d=>{
            const det = d.details || {};
            return {
              heading:d.title,
              points:[
                det.relation,
                det.location,
                det.job,
                det.notes,
                d.rawText
              ].filter(Boolean),
              image_query:"person"
            };
          })
        }
      });
    }

    // =========================
    // 🧠 NORMAL CHAT
    // =========================
    const ai = await openai.chat.completions.create({
      model:"gpt-4o-mini",
      messages:[
        {
          role:"system",
          content:`
You are Wang AI.

Talk naturally like ChatGPT.
Be smart and helpful.

Return JSON:
{
 "title":"",
 "sections":[
  {
   "heading":"",
   "points":[""],
   "image_query":""
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
          points:[raw],
          image_query:"ai"
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

app.get("/memory", async (req,res)=>{
  const data = await Memory.find().sort({createdAt:-1});
  res.json(data);
});

app.listen(3000, ()=>console.log("🚀 AI Running"));
