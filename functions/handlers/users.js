const {db} = require('../utils/admin');

const firebase = require('../utils/firebaseConfig');
const admin = require('../utils/admin');

exports.signup = (req,res)=>{
    const newUser = {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        phone: req.body.phone,
        role: req.body.role,
        state: req.body.state,
        password: req.body.password
    }; // Getting all the data from the signup form

    let jwttoken,userId; // intitalizing the token 
    firebase.auth()
    .createUserWithEmailAndPassword(newUser.email,newUser.password) // creating a new user with email and password
    .then(data =>{
        userId = data.user.uid;
        isEmailVerified = data.user.emailVerified;
        return data.user.getIdToken(); // Returns a promise with the jwt token
    })
    .then( token =>{
        jwttoken = token;
        const userData = { 
            emailStatus: isEmailVerified,
            id: userId, 
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            email: newUser.email,
            phone: newUser.phone,
            role: newUser.role,
            state: newUser.state,
            createdAt: new Date().toISOString(),
            transactions : [],
        }

        return db.doc(`/users/${userData.id}`).set(userData);
    })
    .then(()=>{
        return res.status(201).json({token: jwttoken});
    })
    .then(()=>{
        return firebase.auth().currentUser.sendEmailVerification();
    })
    .catch(err =>{
        console.error(err);
        if(err.code === 'auth/email-already-in-use'){
            return res.status(400).json({email: 'Email is already in use'})
        }
        else{
            return res.status(500).json({ error: err.code });
        }
    })
}

exports.login = (req,res)=>{
    const user = {
        email: req.body.email,
        password: req.body.password
    }

    firebase.auth().signInWithEmailAndPassword(user.email,user.password)
    .then(data =>{
        return data.user.getIdToken();
    })
    .then(token =>{
        return res.json({ token });
    })
    .catch(err =>{
        console.error(err);
        if(err.code === 'auth/wrong-password'){
            return res.status(403).json({general: 'wrong credentials, please try again'})
        }
        else{
            return res.status(500).json({error: err.code})
        }
    })
}

exports.getUserDetails = (req,res) => {
    const userid = req.user.uid;
    db.collection("users").doc(userid).get()
    .then((doc) => {
        if (doc.exists) {
          console.log(`User ${userid} Data : `, doc.data());
          return res.json(doc.data());
        } else {
          console.log("User does not exists");
          return res.json({ error: "User does not exists" });
        }
      })
      .catch((err) => {
        console.log(err);
        return res.status(500).json({ error: err.code });
      });
}

exports.resetPassword =(req,res)=>{
    const email = req.params.email;

    firebase.auth().sendPasswordResetEmail(email).then(()=>{
        return res.json({message: "Email Sent"})
    })
    .catch((err) => {
        console.log(err);
        return res.status(500).json({ error: err.code });
    });
}

/*exports.uploadImage = (req,res) =>{
    const BusBoy = require('busboy');
    const path = require("path");
    const os = require("os");
    const fs = require('fs');

    const busboy = new BusBoy({ headers: req.headers });
    let imageFileName;
    let imageToBeUploaded = {};

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        const imageExtension = filename.split('.')[filename.split('.').length - 1];
        const imageFileName = `${Math.round(Math.random()*10000000)}.${imageExtension}`;
        const filepath = path.join(os.tmpdir(), imageFileName);
        imageToBeUploaded = { filepath, mimetype };
        file.pipe(fs.createWriteStream(filepath));
    });
    busboy.on('finish', () =>{
        firebase.storage().bucket().upload(imageToBeUploaded.filepath,{
            resumable: false,
            metadata: {
                metadata:{
                    contentType: imageToBeUploaded.mimetype
                },
            }
        })
        .then(()=>{
            const imageUrl = `https://firebasestorage.googleapis.com/v0/b/reallos-test.appspot.com/o/${imageFileName}?alt=media`
            return db.doc(`/users/${req.user.uid}`).update({
                imageURL : imageUrl
            });
        })
        .then(()=>{
            return res.json({message: "Image added successfully"});
        })
        .catch((err) => {
            console.log(err);
            return res.status(500).json({ error: err.code });
        })
    })
    busboy.end(req.rawBody);
}*/