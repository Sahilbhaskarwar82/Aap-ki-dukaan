import express from "express";

const app=express();

//compress all responses (must be first)
app.use(compression());

//http security headers
// also it wont manage corp policy
app.use(helmet({crossOriginResourcePolicy:false}));

app.use(morgan("dev")); //morgan is a middleware that logs http requests to the console


//enable cors
//frontend can make request from all origins and cookies can be sent to the server
app.use(
    cors({
        origin:true,
        credentials:true,
    })
);


app.use(express.json({limit:"16kb"}));  //this middleware parses incoming json helps in destructuring in req.body
app.use(express.urlencoded({extended:true,limit:"16kb"}));  //this middleware parses incoming url encoded data  extended=true allows nested objects

app.use(cookieParser()); //this middleware parses incoming cookies from the browser stores them in req.cookies

export default app;