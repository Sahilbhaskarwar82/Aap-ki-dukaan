import express from "express"; //express is a framework for building web applications and APIs
import cors from "cors"; //cors is a middleware for enabling cross-origin resource sharing
import cookieParser from "cookie-parser"; //cookie-parser is a middleware for parsing cookies from the request headers
import compression from "compression";  //compression is a middleware that compresses http responses using algorithms such as gzip/Brotli depending on negotiation
import helmet from "helmet";    //helmet is a middleware that sets various http headers
import morgan from "morgan";    //morgan is a middleware that logs http requests to the console

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