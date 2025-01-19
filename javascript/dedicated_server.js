// Require modules
const {
    errorHandler, getLogger, readRegisteredInfo, updateInfoFactory, getTalkViews
} = require("./routers/helpers");
const {
    config, identities, regInfoFilenames, regInfoUpdateInterval
} = require("./routers/globalSetting");
const adminRouterFactory = require("./routers/adminRouter"),
    studentRouterFactory = require("./routers/studentRouter"),
    teacherRouterFactory = require("./routers/teacherRouter"),
    videoRouterFactory = require("./routers/videoRouter");
const {newUserLogin, verifyUserFactory, createNewUserProfile} = require("./routers/authentication");
const {FILEPATH, PORT, nodeEnv, DNSServerIP, ReadFilesFrom} = config,
    {STUDENT, TEACHER, ADMIN} = identities;

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require("crypto");
const cookieParser = require('cookie-parser');

const logger = getLogger('dedicated');

// Run the application
const app = express();
let server = http.Server(app);
server.listen(PORT, function () {
    logger.info('dedicated server running');
});

// Graceful shutdowns
function terminationHandle(signal) {
    logger.info(`Dedicated server received a ${signal} signal`);

    // Close opened registeredTrials.json file
    server.close(() => {
        process.exit(0)
    })

    // If server hasn't finished in 1000ms, shut down process
    setTimeout(() => {
        process.exit(0)
    }, 1000).unref() // Prevents the timeout from registering on event loop
}

process.on('SIGINT', terminationHandle);
process.on('SIGTERM', terminationHandle);

/**
 * Read registered information from the disk.
 */
let lastModifiedTimes = {registeredStudents: -1, registeredTrials: -1, registeredTalks: -1, suspension: -1}
let registeredInfo = {
    registeredStudents: undefined, registeredTrials: undefined,
    registeredTalks: undefined, suspension: undefined
}
const updateInfo = updateInfoFactory(logger, lastModifiedTimes, registeredInfo);

for (const [infoname, filename] of Object.entries(regInfoFilenames)) {
    readRegisteredInfo(filename).then(
        (info) => {
            registeredInfo[infoname] = info;
            lastModifiedTimes[infoname] = fs.statSync(filename).mtimeMs;
        }
    ).catch((err) => logger.error(err));

    if (regInfoUpdateInterval[infoname] > 0) {
        setInterval(() => {
            updateInfo(infoname).catch(err => {
                logger.error(err.message)
            })
        }, regInfoUpdateInterval[infoname]);
    }
}

// Handling the file read/write requests from JavaScript servers.
// app.get("/service/:infoname/:lasttime", readFile)

/**
 * When developing locally
 */
app.get('/', (req, res) => {
    if (nodeEnv !== "development") {
        // When deployed on k8s
        res.send(`<h1>Dedicated server is on.</h1>`);
    } else {
        // When testing locally
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
})

if (nodeEnv === "development") {
    app.use('/legacy', express.static('legacy'))
    app.use('/testPages', express.static('public/testPages'))
    app.use('/node_modules', express.static('node_modules'))

    const multipart = require("connect-multiparty");
    const multipartyMiddleware = multipart();

    let ts = new Date();
    const teacherRouter = teacherRouterFactory(logger, ts, __dirname, registeredInfo.registeredStudents),
        studentRouter = studentRouterFactory(__dirname),
        videoRouter = videoRouterFactory();

    app.use(express.static(path.join(__dirname, 'public')));
    app.post('/users',
        multipartyMiddleware,
        newUserLogin(logger, ts, registeredInfo)
    );
    app.use('/student', studentRouter)
    app.use('/teacher', teacherRouter)
    app.use('/video', videoRouter)
}

// === Handles requests to add new users into files
app.post('/createUsers', express.json({type: '*/*'}), createNewUserProfile)

// === Handles requests from administrator
const adminRouter = adminRouterFactory(logger, registeredInfo),
    verifyAdmin = verifyUserFactory(ADMIN);
app.use('/admin', adminRouter);
app.get('/admin.html',
    cookieParser(),
    express.json({type: '*/*'}),
    verifyAdmin,
    (req, res) => {
        res.statusCode = 200;
        res.sendFile(path.join(__dirname, 'restricted', 'admin.html'));
    }
);

// === Error handling
app.use(errorHandler(logger));

// ===================================
// Some code about administration control (Timing control)

const options = { /* ... */};
const io = require('socket.io')(server, options);

const randomId = () => crypto.randomBytes(8).toString("hex");

const adminNamespace = io.of("/admin");
adminNamespace.use((socket, next) => {
    socket.userID = randomId();
    socket.name = socket.handshake.auth.name;
    socket.identity = +socket.handshake.auth.identity;

    logger.info('============================')
    logger.info('New socket.')
    logger.debug(`socket.handshake.auth.name: ${socket.handshake.auth.name}`);
    logger.debug(`socket.handshake.auth.identity: ${socket.handshake.auth.identity}`);
    logger.info(`socket.name: ${socket.name}`);
    logger.info(`socket.identity: ${socket.identity}`);

    next();
})

adminNamespace.on("connection", socket => {
    if (socket.identity === STUDENT) {
        socket.join("student");
    } else if (socket.identity === TEACHER) {
        socket.join("teacher");
    } else {
        socket.join("admin");
    }

    const users = [];
    for (let [id, socket] of adminNamespace.sockets) {
        users.push({
            userID: socket.userID,
            name: socket.name,
        });
    }

    adminNamespace.to("admin").emit("users", users); // When new users logged in, notify admin
    logger.info(`Connected users:`);
    logger.info(users.map(user => user.name));

    socket.on("disconnect", async () => {
        const matchingSockets = await adminNamespace.in(socket.userID).allSockets();
        const isDisconnected = matchingSockets.size === 0;
        if (isDisconnected) {
            // notify instructor and admin
            socket.to("teacher").to("admin").emit("user disconnected", socket.userID);
        }
    });

    socket.on("trigger-student-start", () => {
        adminNamespace.to("student").emit("student start");
        logger.info('============================');
        logger.info('Triggered student start event to students');
        adminNamespace.to("admin").emit("triggered");
    });

    socket.on("trigger-teacher-start", () => {
        adminNamespace.to("teacher").to("admin").emit("teacher start");
        logger.info('============================');
        logger.info('Triggered teacher start event to teacher and admin');
        adminNamespace.to("admin").emit("triggered");
    });

    socket.on("start", () => {
        adminNamespace.to("student").emit("student start");
        adminNamespace.to("teacher").to("admin").emit("teacher start");
        logger.info('============================');
        logger.info('Triggered all start event to students, teacher and admin');
        adminNamespace.to("admin").emit("triggered");
    });

    socket.on("end", () => {
        adminNamespace.to("student").emit("end");
        adminNamespace.to("teacher").to("admin").emit("end");
        logger.info('============================');
        logger.info('Triggered all end event to students, teacher and admin');
        adminNamespace.to("admin").emit("triggered");
    });
});


// // ===================================
// // Deployment code on k8s. Responsible for spectral clustering.
// // Now moved to python dedicated server.
// // ===================================
// app.get('/gazeData/teacher', (req, res) => {
//     res.send(`<h1>Dedicated server, page /gazeData/teacher</h1>`);
// })
//
// app.post('/gazeData/teacher', express.json({type: '*/*'}), async (req, res) => {
//     // let { , role, pts } = req.body;
//     let role = +req.body['role'];
//     logger.info('==========================');
//     logger.info(`Received POST from ${role === STUDENT ? 'student' : 'teacher'}`);
//
//     try {
//         // teacher(2) or student(1)
//         if (role === TEACHER) {
//             // we have teacher request syncing
//
//             let fixationX = [];
//             let fixationY = [];
//
//             let fixationFlat = [];
//             let saccadeFlat = [];
//             let cognitiveFlat = [];
//
//             all_fixations.forEach(fixations => {
//                 fixationFlat.push(
//                     fixations
//                 );
//             });
//
//             all_saccades.forEach(saccades => {
//                 saccadeFlat.push(
//                     saccades
//                 );
//             });
//
//             for (let [stuNum, cognitive] of all_cognitive.entries()) {
//                 cognitiveFlat.push({stuNum, ...cognitive});
//             }
//
//             fixationFlat = fixationFlat.flat();
//             saccadeFlat = saccadeFlat.flat();
//
//             fixationX = fixationFlat.map(fixation => [fixation.x_per]);
//             fixationY = fixationFlat.map(fixation => [fixation.y_per]);
//
//             logger.info(`Fixations to cluster : ${fixationX.length}`);
//
//             res.statusCode = 200;
//             res.format({
//                 'application/json': function () {
//                     res.send({
//                         fixations: fixationFlat,
//                         saccades: saccadeFlat,
//                         cognitives: cognitiveFlat,
//                         result: spectralCluster(fixationX, fixationY, 5),
//                     });
//                 }
//             });
//
//             res.send();
//         } else {
//             // we have students posting gaze information
//             let stuNum = req.body['stuNum'];
//             logger.info(`Student number : ${stuNum}`);
//
//             all_fixations.set(stuNum, req.body['fixations']);
//             all_saccades.set(stuNum, req.body['saccades']);
//             all_cognitive.set(stuNum, req.body['cognitive']);
//
//             logger.info(`Receive ${all_fixations.get(stuNum).length} fixations at ${new Date()}`);
//
//             res.statusCode = 200;
//             res.send({
//                 result: `Fixations and saccades are logged @ ${Date.now()}`,
//             });
//
//             last_seen[stuNum] = Date.now();
//         }
//     } catch (e) {
//         logger.error(e.message);
//         res.send({error: e.message});
//     }
// });
//
// setInterval(() => {
//     let now = Date.now();
//     Object.entries(last_seen).forEach(([name, ts]) => {
//         if ((now - ts) > 5000) {
//             // logger.info(`${name} lost connection. remove!`);
//             all_fixations.delete(name);
//             all_saccades.delete(name);
//         }
//     });
// }, 5000);

// ===================================
// Some code about spectral clustering
// Now moved to python dedicated server.
// ===================================
//
// const kmeans = require('ml-kmeans');
// const {Matrix, EigenvalueDecomposition} = require('ml-matrix');
// const {datetozulu} = require("jsrsasign");
// const {error} = require("winston");
// const multipart = require("connect-multiparty");
//
// function spectralCluster(X, Y, repeat) {
//     logger.debug(`inside spectral cluster, X : ${X.length}, Y : ${Y.length}, repeat : ${repeat}`)
//
//     let matX = X instanceof Matrix ? X : new Matrix(X);
//     let matY = Y instanceof Matrix ? Y : new Matrix(Y);
//
//     // Construct similarity matrix
//     let sigma = 7.5;
//     let distance = matX.repeat({columns: matX.rows})
//         .subtract(matX.transpose().repeat({rows: matX.rows}))
//         .pow(2)
//         .add(
//             matY.repeat({columns: matY.rows})
//                 .subtract(matY.transpose().repeat({rows: matY.rows}))
//                 .pow(2)
//         ).sqrt().div(-2 * sigma * sigma).exp();
//     let D = Matrix.diag(
//         distance.mmul(Matrix.ones(distance.rows, 1)).to1DArray().map(item => 1 / item)
//     );
//
//     // Eigenvalue decomposition
//     let eig = new EigenvalueDecomposition(Matrix.eye(distance.rows).sub(D.mmul(distance)));
//     let lambda = eig.realEigenvalues.sort(); // js array
//     let deltaLambda = lambda.slice(0, lambda.length - 1)
//         .map((elem, i) => lambda[i + 1] - elem);
//     let k = deltaLambda.slice(0, Math.ceil(lambda.length / 2))
//         .reduce((maxIdx, item, index) => deltaLambda[maxIdx] < item ? index : maxIdx, 0) + 1;
//     // var k = Math.random() > 0.5 ? 4 : 3;
//     logger.debug(`k = ${k}`);
//
//     let columns = [];
//     for (let i = 0; i < k; i += 1) {
//         columns.push(i);
//     } // it surprises me that JS has no native function to generate a range...
//     let data = eig.eigenvectorMatrix.subMatrixColumn(columns).to2DArray(); // Dimension reduced
//
//     // K-means, run repeat times for stable clustering
//     let trails = []
//     for (let i = 0; i < repeat; i += 1) {
//         trails.push(reorder(kmeans(data, k).clusters, k));
//     }
//     return mode(trails, k);
// }
//
// function reorder(cluster, k) {
//     let prev = 0;
//     let nClass = 1;
//     let order = [cluster[prev]];
//
//     while (nClass <= k) {
//         if (cluster[prev] !== cluster[prev + 1] && order.indexOf(cluster[prev + 1]) === -1) {
//             nClass += 1;
//             order.push(cluster[prev + 1]);
//         }
//         prev += 1;
//     }
//
//     return cluster.map(elem => order.indexOf(elem));
// }
//
// function mode(nestedArray, max) {
//     let depth = nestedArray.length;
//     let arrLen = nestedArray[0].length;
//     let mode = [];
//
//     for (let i = 0; i < arrLen; i += 1) {
//         let elemCount = Matrix.zeros(1, max).to1DArray();
//         for (let j = 0; j < depth; j += 1) {
//             elemCount[nestedArray[j][i]] += 1;
//         }
//         mode.push(elemCount.indexOf(Math.max(...elemCount)));
//     }
//
//     logger.debug(mode);
//     return mode
// }
//
