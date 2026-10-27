import dotenv from "dotenv";
dotenv.config({path:'./.env'});

import connectDB from "./db/index.js"
import app from "./app.js"

connectDB()
.then(()=>{
    let port=process.env.PORT||8000; //port is set to 8000 if process.env.PORT is not defined
    app.listen(port,()=>{
        console.log(`Server running at port ${port}\n`);  //server is started on the specified port
    })
})
.catch((err)=>{
    console.log(err);
})
