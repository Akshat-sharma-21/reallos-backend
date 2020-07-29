const functions = require("firebase-functions");
const cors = require("cors");
const { Storage } = require("@google-cloud/storage");
const spawn = require("child-process-promise").spawn;
const path = require("path");
const os = require("os");
const fs = require("fs");
const gs = require("gs");
const firebase = require("./utils/firebaseConfig");
const app = require("express")();
const isEqual = require("lodash.isequal");
app.use(cors()); // using cors to for creating restful api

const Auth = require("./utils/Auth");

const {
  signup,
  login,
  getUserDetails,
  resetPassword,
  updateProfile,
  addUserDetails,
  getNotifications,
} = require("./handlers/users");
const {
  createTransaction,
  deleteTransaction,
  updateTransaction,
  readTransaction,
  addPeople,
  deletePeople,
  addTransactionToUser,
  addMultiplePeople,
  getAllTransaction,
  getAllPeople,
  removeTransactionFromAllUser,
} = require("./handlers/transactions");
const {
  addTodo,
  deleteTodo,
  readTodo,
  editTodo,
  getAllTodo,
  markDone,
} = require("./handlers/todo");
const {
  invitationSystem,
  invitationMail,
} = require("./handlers/invitationSystem");

//Signup Route
app.post("/signup", signup);

// Add User Details
app.post("/add-user-details/:uid", addUserDetails);

// login route
app.post("/login", login);

// Get User Details
app.get("/user-details", Auth, getUserDetails);

// Password Reset
app.post("/reset-password/:email", resetPassword);

// Update Profile
app.put("/update-profile", Auth, updateProfile);

// Get All Notifications
app.get("/notifications", Auth, getNotifications);

// Transaction Related
app.post("/create-transaction", Auth, createTransaction);
app.delete("/delete-transaction/:tid", Auth, deleteTransaction);
app.put("/update-transaction/:tid", Auth, updateTransaction);
app.get("/get-transaction/:tid", readTransaction);
app.post("/add-people/:tid", Auth, addPeople);
app.delete("/delete-people/:tid/:email", Auth, deletePeople);
app.put("/add-transaction-to-user/:tid", Auth, addTransactionToUser);
app.post("/add-multiple-people/:tid", Auth, addMultiplePeople);
app.get("/get-all-transactions/:uid", Auth, getAllTransaction);
app.get("/get-all-people/:tid", Auth, getAllPeople);
app.put(
  "/remove-transaction-from-users/:tid",
  Auth,
  removeTransactionFromAllUser
);

//Task Related
app.post("/add-task/:tid", Auth, addTodo);
app.delete("/delete-task/:tid/:taskid", Auth, deleteTodo);
app.get("/get-task/:tid/:taskid", readTodo);
app.put("/update-task/:tid/:taskid", Auth, editTodo);
app.get("/get-all-tasks/:tid", Auth, getAllTodo);
app.put("/task-done/:tid/:taskid", Auth, markDone);

// Invitation System Related
app.post("/invite/:tid", Auth, invitationSystem);

// Invitation Mail
app.post("/email", invitationMail);

// Core HTTP API for app
exports.api = functions.https.onRequest(app);

// Create thumbnail when a paperwork is uploaded
exports.createThumbnail = functions.storage
  .object()
  .onFinalize((object, context) => {
    const filePath = object.name;
    const fileDir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const tempFilePath = path.join(os.tmpdir(), fileName);

    if (!fileName.endsWith(".pdf")) return false;

    const newFileName = `${path.basename(fileName, ".pdf")}.png`;
    const tempNewFilePath = path.join(os.tmpdir(), newFileName);

    const storage = new Storage();
    const bucket = storage.bucket(object.bucket);

    return bucket
      .file(filePath)
      .download({
        destination: tempFilePath,
      })
      .then(() => {
        console.info("File was locally downloaded to:", tempFilePath);
        console.log("Output Dir:", tempNewFilePath);

        return new Promise((resolve, reject) => {
          gs()
            .batch()
            .nopause()
            .option("-r" + 50 * 2)
            .option("-dDownScaleFactor=2")
            .option("-dFirstPage=1")
            .option("-dLastPage=1")
            .executablePath("./lambda-ghostscript/bin/gs")
            .device("png16m")
            .output(tempNewFilePath)
            .input(tempFilePath)
            .exec((err, stdout, stderr) => {
              if (!err) {
                console.log("gs executed w/o error");
                console.log("stdout", stdout);
                console.log("stderr", stderr);
                resolve();
              } else {
                console.log("gs error:", err);
                reject(err);
              }
            });
        });
      })
      .then(() => {
        console.log("Created PNG Thumbnail in:", tempNewFilePath);

        return bucket.upload(tempNewFilePath, {
          destination: path.join(fileDir, "thumbnails", newFileName),
        });
      })
      .catch((err) => {
        console.error("Error Occurred:", err);
        return err;
      });
  });

// Delete Transaction from User Array when a Transaction is deleted

exports.deleteTransactionFromUser = functions.firestore
  .document("transactions/{tid}")
  .onDelete(async (snapshot, content) => {
    const query = firebase
      .firestore()
      .collection("users")
      .where("transactions", "array-contains", content.params.tid);
    await query
      .get()
      .then((querySnapshot) => {
        return querySnapshot.forEach((doc) => {
          firebase
            .firestore()
            .collection("users")
            .doc(doc.id)
            .update({
              transactions: firebase.firestore.FieldValue.arrayRemove(
                content.params.tid
              ),
            });
        });
      })
      .catch((err) => {
        console.log(err);
        return;
      });
  });

// Delete Transaction from User Array when the user is removed from a Transaction

exports.deleteTransactionWhenRemoved = functions.firestore
  .document("transactions/{tid}/people/{email}")
  .onDelete(async (snapshot, content) => {
    const query = firebase
      .firestore()
      .collection("users")
      .where("email", "==", content.params.email);
    await query
      .get()
      .then((querySnapshot) => {
        return querySnapshot.forEach((doc) => {
          firebase
            .firestore()
            .collection("users")
            .doc(doc.id)
            .update({
              transactions: firebase.firestore.FieldValue.arrayRemove(
                content.params.tid
              ),
            });
        });
      })
      .catch((err) => {
        console.log(err);
        return;
      });
  });

// Notifications

exports.createTaskNotification = functions.firestore
  .document("transactions/{tid}/tasks/{taskid}")
  .onCreate(async (snapshot, content) => {
    const query = firebase
      .firestore()
      .collection("users")
      .where("transactions", "array-contains", content.params.tid);

    const querySnapshot = await query.get();
    return querySnapshot.forEach((doc) => {
      firebase
        .firestore()
        .collection("users")
        .doc(doc.id)
        .collection("notifications")
        .add({
          isRead: false,
          type: "TASK_CREATE",
          taskName: snapshot.data().title,
          dueDate: snapshot.data().date,
          assignedBy: snapshot.data().assignedBy.email,
          assignedTo: snapshot.data().assignedTo.email,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          tid: content.params.tid,
        });
    });
  });

exports.updateTaskNotification = functions.firestore
  .document("transactions/{tid}/tasks/{taskid}")
  .onUpdate(async (snapshot, content) => {
    const newValue = snapshot.after.data();
    const oldValue = snapshot.before.data();
    const query = firebase
      .firestore()
      .collection("users")
      .where("transactions", "array-contains", content.params.tid);
    if (newValue.completed === true && oldValue.completed === false) {
      const querySnapshot = await query.get();

      return querySnapshot.forEach((doc) => {
        firebase
          .firestore()
          .collection("users")
          .doc(doc.id)
          .collection("notifications")
          .add({
            isRead: false,
            type: "TASK_COMPLETED",
            taskName: newValue.title,
            dueDate: newValue.date,
            assignedBy: newValue.assignedBy.email,
            assignedTo: newValue.assignedTo.email,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            tid: content.params.tid,
          });
      });
    } else {
      const querySnapshot = await query.get();
      return querySnapshot.forEach((doc) => {
        firebase
          .firestore()
          .collection("users")
          .doc(doc.id)
          .collection("notifications")
          .add({
            isRead: false,
            type: "TASK_UPDATE",
            taskName: newValue.title,
            dueDate: newValue.date,
            assignedBy: newValue.assignedBy.email,
            assignedTo: newValue.assignedTo.email,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            tid: content.params.tid,
          });
      });
    }
  });

exports.deleteTaskNotification = functions.firestore
  .document("transactions/{tid}/tasks/{taskid}")
  .onDelete(async (snapshot, content) => {
    const value = snapshot.data();
    const query = firebase
      .firestore()
      .collection("users")
      .where("transactions", "array-contains", content.params.tid);
    const querySnapshot = await query.get();

    return querySnapshot.forEach((doc) => {
      firebase
        .firestore()
        .collection("users")
        .doc(doc.id)
        .collection("notifications")
        .add({
          isRead: false,
          type: "TASK_DELETE",
          taskName: value.title,
          deletedBy: value.assignedBy.email,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          tid: content.params.tid,
        });
    });
  });

exports.deleteInvitation = functions.firestore
  .document("transactions/{tid}/people/{email}")
  .onDelete(async (snapshot, content) => {
    const value = snapshot.data();
    const query = firebase
      .firestore()
      .collection("users")
      .where("transactions", "array-contains", content.params.tid);
    const querySnapshot = await query.get();
    return querySnapshot.forEach((doc) => {
      firebase
        .firestore()
        .collection("users")
        .doc(doc.id)
        .collection("notifications")
        .add({
          isRead: false,
          type: "INVITATION_RETRACTED",
          name: value.name,
          role: value.role,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          tid: content.params.tid,
        });
    });
  });

exports.addPeopleNotification = functions.firestore
  .document("transactions/{tid}/people/{email}")
  .onCreate(async (snapshot, content) => {
    const value = snapshot.data();
    const query = firebase
      .firestore()
      .collection("users")
      .where("transactions", "array-contains", content.params.tid);
    const querySnapshot = await query.get();
    return querySnapshot.forEach((doc) => {
      firebase
        .firestore()
        .collection("users")
        .doc(doc.id)
        .collection("notifications")
        .add({
          isRead: false,
          type: "INVITATION_SENT",
          name: value.name,
          role: value.role,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          tid: content.params.tid,
        });
    });
  });

exports.updatePeopleNotification = functions.firestore
  .document("transactions/{tid}/people/{email}")
  .onUpdate(async (snapshot, content) => {
    const value = snapshot.after.data();
    const query = firebase
      .firestore()
      .collection("users")
      .where("transactions", "array-contains", content.params.tid);
    const querySnapshot = await query.get();
    return querySnapshot.forEach((doc) => {
      firebase
        .firestore()
        .collection("users")
        .doc(doc.id)
        .collection("notifications")
        .add({
          isRead: false,
          type: "INVITATION_ACCEPTED",
          name: value.name,
          role: value.role,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          tid: content.params.tid,
        });
    });
  });

exports.addPaperWorkNotification = functions.firestore
  .document("transactions/{tid}/paperwork/{name}")
  .onCreate(async (snapshot, content) => {
    const value = snapshot.data();
    const query = firebase
      .firestore()
      .collection("users")
      .where("transactions", "array-contains", content.params.tid);

    const querySnapshot = await query.get();
    return querySnapshot.forEach((doc) => {
      firebase
        .firestore()
        .collection("users")
        .doc(doc.id)
        .collection("notifications")
        .add({
          isRead: false,
          type: "DOC_UPLOADED",
          name: content.params.name,
          uploadedBy: value.creator,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          tid: content.params.tid,
        });
    });
  });

exports.deletePaperWorkNotification = functions.firestore
  .document("transactions/{tid}/paperwork/{name}")
  .onDelete(async (snapshot, content) => {
    const value = snapshot.data();
    const query = firebase
      .firestore()
      .collection("users")
      .where("transactions", "array-contains", content.params.tid);
    const querySnapshot = await query.get();
    return querySnapshot.forEach((doc) => {
      firebase
        .firestore()
        .collection("users")
        .doc(doc.id)
        .collection("notifications")
        .add({
          isRead: false,
          type: "DOC_DELETED",
          name: content.params.name,
          uploadedBy: value.creator,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          tid: content.params.tid,
        });
    });
  });

exports.updatePaperWorkNotification = functions.firestore
  .document("transactions/{tid}/paperwork/{name}")
  .onUpdate(async (snapshot, content) => {
    const newValue = snapshot.after.data();
    const oldValue = snapshot.before.data();
    const query = firebase
      .firestore()
      .collection("users")
      .where("transactions", "array-contains", content.params.tid);

    if (isEqual(newValue.accessData, oldValue.accessData)) {
      const querySnapshot = await query.get();
      return querySnapshot.forEach((doc) => {
        firebase
          .firestore()
          .collection("users")
          .doc(doc.id)
          .collection("notifications")
          .add({
            isRead: false,
            type: "DOC_UPDATE",
            name: content.params.name,
            uploadedBy: newValue.creator,
            lastModifiedBy: newValue.lastModified.email,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            tid: content.params.tid,
          });
      });
    } else {
      const newPermission = newValue.accessData;
      const oldPermission = oldValue.accessData;

      const querySnapshot = await query.get();
      Object.keys(newPermission).forEach((key) => {
        if (newPermission[key] !== oldPermission[key]) {
          return querySnapshot.forEach((doc) => {
            firebase
              .firestore()
              .collection("users")
              .doc(doc.id)
              .collection("notifications")
              .add({
                isRead: false,
                type: "DOC_PERM_CHANGED",
                email: key,
                access: newPermission[key],
                name: content.params.name,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                tid: content.params.tid,
              });
          });
        }
      });
    }
  });
