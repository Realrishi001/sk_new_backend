import jwt from 'jsonwebtoken'
import config from 'config'

const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if(!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({message : "Authorizaiton token is missing or malformed"});
    }

    const token = authHeader.split(" ")[1];

    try{
        const decoded = jwt.verify(token, config.get("jwtSecret"));
        req.adminId = decoded.id;
        next();
    }catch(err) {
        return res.status(401).json({
            message : "Invalid or expired Token"
        });
        console.error("Token verification failed : ", err);
    }
}

export {verifyToken};