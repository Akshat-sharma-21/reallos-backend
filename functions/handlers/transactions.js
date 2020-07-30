const { db } = require("../utils/admin");
const firebase = require("../utils/firebaseConfig");
const { invitationMail } = require("./invitationSystem");

exports.createTransaction = (req, res) => {
  const newTransaction = {
    name: req.body.name,
    address: req.body.address,
    desc: req.body.desc,
    admin: req.user.uid,
    createdAt: new Date().toISOString(),
    assistView: [],
  };
  let id;
  let userData;
  db.doc(`users/${newTransaction.admin}`).get().then((userDoc)=>{
    userData = userDoc.data()
    return db.collection("transactions")
    .add(newTransaction)
    .then((doc) => {
      console.log(doc.id);
      id = doc.id;
      return id
    })
    .then((id)=>{
      return db.doc(`transactions/${id}`).collection("people").doc(userData.email).set({
        email: userData.email,
        name: `${userData.firstName} ${userData.lastName}`,
        role: userData.role,
        uid: newTransaction.admin,
        accepted: true,
      })
    })
    .then(()=>{
      return res.json({id: id})
    })
    .catch((err) => {
      console.log(err);
      return res.status(500).json({ error: err.code });
    });
  })
  .catch((err) => {
      console.log(err);
      return res.status(500).json({ error: err.code });
    });
};

exports.deleteTransaction = (req, res) => {
  const document = db.doc(`/transactions/${req.params.tid}`);
  document
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      if (doc.data().admin !== req.user.uid) {
        return res.status(403).json({ error: "Unauthorized" });
      } else {
        return document.delete();
      }
    })
    .then(() => {
      return res.json({ message: "Transaction Successfully deleted" });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.code });
    });
};

exports.updateTransaction = (req, res) => {
  const document = db.doc(`/transactions/${req.params.tid}`);
  let transactionDetails = {};

  if (req.body.name.trim() !== "") transactionDetails.name = req.body.name;
  if (req.body.address.trim() !== "")
    transactionDetails.address = req.body.address;
  if (req.body.desc.trim() !== "") transactionDetails.desc = req.body.desc;
  document
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      if (doc.data().admin !== req.user.uid) {
        return res.status(403).json({ error: "Unauthorized" });
      } else {
        return document.update(transactionDetails);
      }
    })
    .then(() => {
      console.log("Transaction successfully updated!");
      return res.json({
        message: `Transaction ${req.params.tid} successfully updated!`,
      });
    })
    .catch((err) => {
      console.log(err);
      return res.status(500).json({ error: err.code });
    });
};

exports.readTransaction = (req, res) => {
  const tid = req.params.tid;
  var status = {
    all: 0,
    completed: 0,
  };
  var obj;

  db.collection("transactions")
    .doc(tid)
    .get()
    .then((doc) => {
      if (doc.exists) {
        obj = doc.data();
        return db
          .collection(`transactions/${tid}/tasks`)
          .get()
          .then((snapshot) => {
            return snapshot.forEach((doc) => {
              if (doc.data().completed) {
                status.all++;
                status.completed++;
              } else {
                status.all++;
              }
            });
          });
      } else {
        console.log("Transaction does not exists");
        return res.json({ error: "Transaction does not exists" });
      }
    })
    .then(() => {
      return res.json(Object.assign(obj, status));
    })
    .catch((err) => {
      console.log(err);
      return res.status(500).json({ error: err.code });
    });
};

exports.addPeople = (req, res) => {
  const tid = req.params.tid;
  let transactionData;
  const newPeople = {
    email: req.body.email,
    accepted: false,
    uid: "",
    role: req.body.role,
    name: req.body.name,
  };
  const txnDoc = db.collection("transactions").doc(tid);
  txnDoc
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.json({ error: "Transaction not found" });
      } else {
        transactionData = doc.data();
        return txnDoc.collection("people").doc(newPeople.email).set(newPeople);
      }
    })
    .then(() => {
      return invitationMail(
        newPeople.name,
        newPeople.email,
        tid,
        transactionData.name,
        transactionData.address,
        newPeople.role
      );
    })
    .then(() => {
      return res.json({ id: newPeople.email });
    })
    .catch((err) => {
      console.log(err);
      return res.status(500).json({ error: err.message });
    });
};

exports.deletePeople = (req, res) => {
  const person = {
    tid: req.params.tid,
    email: req.params.email,
  };
  db.collection("transactions")
    .doc(person.tid)
    .collection("people")
    .doc(person.email)
    .delete()
    .then(() => {
      return res.json({ message: "Successfully Removed" });
    })
    .catch((err) => {
      console.log(err);
      return res.status(500).json({ error: err.code });
    });
};

exports.addTransactionToUser = (req, res) => {
  const tid = req.params.tid;
  const transactionList = [req.params.tid];
  userDoc = db.doc(`users/${req.user.uid}`);

  userDoc
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return userDoc.set({
          transactions: transactionList,
        });
      } else {
        var txnList = doc.data().transactions;
        txnList.push(tid);
        return userDoc.update({
          transactions: txnList,
        });
      }
    })
    .then(() => {
      return res.json({
        message: `${tid} added successfully to ${req.user.uid}`,
      });
    })
    .catch((err) => {
      console.log(err);
      return res.status(500).json({ error: err.code });
    });
};

exports.addMultiplePeople = (req, res) => {
  const tid = req.params.tid;
  const people = req.body.people;
  const txnDoc = db.collection("transactions").doc(tid);
  txnDoc
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.json({ error: "Transaction not found" });
      } else {
        people.forEach((person) => {
          txnDoc.collection("people").doc(person.email).set(person);
          invitationMail(
            person.name,
            person.email,
            tid,
            doc.data().name,
            doc.data().address,
            person.role
          );
        });
        return res.json({ message: "All added successfully" });
      }
    })
    .catch((err) => {
      return res.status(500).json({ error: err.code });
    });
};

exports.getAllTransaction = (req, res) => {
  const uid = req.params.uid;

  db.collection("users")
    .doc(uid)
    .get()
    .then((doc) => {
      return res.json({ txnList: doc.data().transactions });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.code });
    });
};

exports.getAllPeople = (req, res) => {
  const tid = req.params.tid;
  const peopleArr = [];

  db.collection("transactions")
    .doc(tid)
    .collection("people")
    .get()
    .then((querySnapshot) => {
      return querySnapshot.forEach((doc) => {
        peopleArr.push(doc.data());
      });
    })
    .then(() => {
      return res.json({ peopleList: peopleArr });
    })
    .catch((err) => {
      console.log(err);
      return res.status(500).json({ error: err.code });
    });
};

exports.removeTransactionFromAllUser = (req, res) => {
  mylist = [];
  const tid = req.params.tid;
  db.collection("users")
    .where("transactions", "array-contains", tid)
    .then((doc) => {
      return res.json({ message: doc });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.code });
    });
};

exports.testarray = (req, res) => {
  const query = firebase
    .firestore()
    .collection("users")
    .where("transactions", "array-contains", req.params.tid);
  var list = [];
  query
    .get()
    .then((snapshot) => {
      return snapshot.docs.forEach((doc) => {
        list.push(doc.data());
        console.log(doc.id, doc.data());
      });
    })
    .then(() => {
      return res.json({ message: "success", data: list });
    })
    .catch((err) => {
      return res.json({ error: err.message });
    });
};

exports.invite = (req, res) => {
  invitationMail(req.body.userName,
            req.body.email,
            req.body.tid,
            req.body.name,
            req.body.address,
            req.body.role);
}