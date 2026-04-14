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
  type: String,
  title: String,
  details: Object,
  rawText: String,
  createdAt: { default: Date.now }
}, { strict:false }));

// 🧠 INTENT
function isSave(text){
  return /is my|remember|save|add/i.test(text);
}

app.post("/chat", async (req,res)=>{
  const { message } = req.body;

  try{

    // 🧠 SAVE PEOPLE (SMART)
    if(isSave(message)){

      const extract = await openai.chat.completions.create({
        model:"gpt-4o-mini",
        messages:[
          {
            role:"system",
            content:`
Extract person details.

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

      await Memory.create({
        type:"people",
        title: parsed.name,
        details: parsed,
        rawText: message
      });

      return res.json({
        reply:{
          title:`🧠 Saved: ${parsed.name}`,
          sections:[{
            heading:"Person stored",
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

    // 🧠 RETRIEVE
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

    // 🧠 NORMAL CHAT
    const response = await openai.chat.completions.create({
      model:"gpt-4o-mini",
      messages:[
        {
          role:"system",
          content:`
You are Wang AI.

Talk naturally like ChatGPT.
Ask questions if needed.
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

    let raw = response.choices[0].message.content;

    let reply;

    try{
      const parsed = JSON.parse(raw);

      if(!parsed.title){
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

app.listen(3000, ()=>console.log("🚀 Wang AI Running"));
