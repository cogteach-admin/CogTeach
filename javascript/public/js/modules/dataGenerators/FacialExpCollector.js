// =============================================
// Expression Collector
// =============================================
import DataGenerator from "./DataGenerator.js";

/**
 * The data generator that collects facial expression and (optionally) infer confusion
 * by uploading facial expressions to the remote server.
 *
 * When we use the collector to infer confusion, it adds a string of "confusion"/"neutral"/"N/A"
 * to the dataManager. There is one facial expression collector that does not infer confusion and
 * adds base64-encoded facial images to the dataManager.
 */
class ExpressionCollector extends DataGenerator {
    constructor() {
        super();
    }

    async generateData() {
        // Will not be called (expect RandomEstimator).
        // Since GazeEstimators are not triggered.
    }

    init() {
    }

    calibrate() {
    }

    infer() {
    }

    start() {
    }

    end() {
    }
}

/**
 * The placeholder expression collector. It does nothing.
 * @constructor
 * @param configurations - The configuration object describing callbacks of the expression collector.
 */
class EmptyExpressionCollector extends ExpressionCollector {
    constructor(configurations) {
        super();

        let {onCollectEnd: onCalibrationEnd} = configurations;
        this.onCalibrationEnd = onCalibrationEnd;
    }

    calibrate() {
        this.onCalibrationEnd();
    }
}

/**
 * The expression collector that generates random confusion/neutral/not detected states.
 * @constructor
 * @param configurations - The configuration object describing callbacks of the expression collector.
 * @param dataManager - The data manager that gathers all data to be posted.
 */
class RandomExpressionCollector extends ExpressionCollector {
    constructor(configurations, dataManager) {
        super();

        let {onCollectEnd: onCalibrationEnd} = configurations;

        this.onCalibrationEnd = onCalibrationEnd;

        this.dataManager = dataManager;
        this.timeCalled = 0;
    }

    /**
     * To generate random confusion detection results.
     * @returns {Promise<string>}
     */
    async generateData() {
        this.timeCalled += 1;
        if (this.timeCalled % updateInterval !== 0) {
            // Only generate the random data when being called this.updateInterval times
            return "Not reach updateInterval."
        }
        // Generate random cognitive information
        for (let i = 0; i < updateInterval; i++) {
            this.dataManager.confusionWindow[i] = 'N/A';
        }
        if (Math.random() > 0.3) {
            for (let i = 0; i < updateInterval; i++) {
                this.dataManager.confusionWindow[i] = Math.random() > 0.5 ? "Confused" : "Neutral";
            }
        }

        this.dataManager.inattentionCounter = Math.random() > 0.5 ? 1 : 0;
        return "Random confusion/inattention data added."
    }

    /**
     * Calibrate the facial expression collector.
     *
     * Since this facial expression collector generates random confusion results, this actually does nothing.
     * Only kept for compatibility,
     * @param fastMode - Whether calibrate or not.
     */
    calibrate(fastMode) {
        if (fastMode) {
            console.log('Fast mode is on. No data collection process.');
        } else {
            console.log('You are using a random FacialExpCollector. Nothing will happen.');
        }
        closeModal("facial-expression-collection-modal");
        this.onCalibrationEnd();
    }
}

/**
 * The expression collector that collects facial expression to the dataManager.
 * @param configurations - The configuration object describing callbacks of the expression collector.
 * @param camera - A wrapper for managing the camera. Please refer to studentClient.js for how it is used,
 * @param dataManager - The data manager that gathers all data to be posted.
 */
class PureExpressionCollector extends ExpressionCollector {
    constructor(configurations, camera, dataManager) {
        super();

        this.dataManager = dataManager;

        let {constraint, quicksend = false, endpoint = "/service/image"} = configurations;

        this.videoConstraint = constraint;
        this.quicksend = quicksend;
        this.endpoint = endpoint;

        this.videoElement = document.getElementById('input_video');
        this.canvasElement = document.getElementById('output_canvas');
        this.canvasCtx = this.canvasElement.getContext('2d');
    }

    /**
     * Setting up the camera stream with the video DOM element.
     */
    calibrate() {
        navigator.mediaDevices.getUserMedia({ video: this.videoConstraint, audio: false })
            .then((stream) => {
                this.videoElement.srcObject = stream;
            })
            .catch((err) => {
                console.error(`An error occurred: ${err}`);
            });
    }

    /**
     * Adding the base64-encoded facial expression to the dataManager.
     * @returns {Promise<string>}
     */
    async generateData() {
        this.canvasCtx.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
        let b64Frame = this.canvasElement.toDataURL("image/png", 1.0).split(",")[1];
        if (this.quicksend) {
            // send immediately, rather than with other data
            let body = JSON.stringify({
                stuNum: userInfo['number'],
                lectureId: localStorage.getItem("talkId"),
                facialExpression: [[Date.now(), b64Frame]],
            }), headers = {'Content-Type': 'application/json'};
            setTimeout(() => {
                console.debug("posting face");
                fetch(this.endpoint, {method: 'POST', body, headers}).catch(err => console.error(err));
            }, 0)
            return Promise.resolve("Face expression to be uploaded.")
        } else {
            // send facial expressions along with other data
            this.dataManager.addFacialExpData(b64Frame);
            return "Facial expression resolved."
        }
    }

    /**
     * Start the facial expression collector.
     */
    start() {
        this.videoElement.play();
        this.canvasElement.setAttribute('width', this.videoElement.videoWidth);
        this.canvasElement.setAttribute('height', this.videoElement.videoHeight);
    }

    /**
     * Terminate the facial expression collector.
     */
    end() {
        this.videoElement.pause();
    }
}

/**
 * The expression collector that generates confusion/neutral/not detected states by
 * sending facial expressions to the remote server.
 * @constructor
 * @param configurations - The configuration object describing callbacks of the expression collector.
 * @param camera - A wrapper for managing the camera. Please refer to studentClient.js for how it is used,
 * @param dataManager - The data manager that gathers all data to be posted.
 */
class SVMExpressionCollector extends ExpressionCollector {
    constructor(configurations, camera, dataManager) {
        super();
        let {total, onCollectEnd: onCalibrationEnd} = configurations;

        this.camera = camera;
        this.dataManager = dataManager;

        // Four states: NEUTRAL, CONFUSED, NOTCALIBRATED, READY
        // First three states are used for calibration. Indicating:
        // collecting neutral/confused exps, or in between these two states.
        // READY indicates the collector is ready to infer.
        this.collectingStates = new Array(READY);
        this.collectingStates[NEUTRAL] = new CollectingNeutralState(this);
        this.collectingStates[CONFUSED] = new CollectingConfusedState(this);
        this.collectingStates[NOTCALIBRATED] = new NotClibratedState(this);
        this.collectingStates[READY] = new ReadyState(this, onCalibrationEnd);
        this.currentState = undefined;

        // For incremental training
        this.modelVersion = 0;

        // The total number of confused training images and neutral training images.
        this.totalConfused = total;
        this.totalNeutral = total;

        this.videoElement = document.getElementById('input_video');
        this.canvasElement = document.getElementById('output_canvas');
        this.canvasCtx = this.canvasElement.getContext('2d');
        this.collectElement = document.getElementById('collect_canvas');
        this.collectCtx = this.collectElement.getContext('2d');
    }

    /**
     * Calibrate the facial expression collector. This means to collect confused and neutral training
     * facial expressions for remote SVM classifier.
     *
     * @param fastMode - Whether calibrate or not. True to skip calibration.
     */
    calibrate(fastMode) {
        if (fastMode) {
            console.log('Fast mode is on. No data collection process.');
            this.totalConfused = 0;
            this.totalNeutral = 0;
            this.collectingState = READY;
        } else {
            this.collectingState = this.currentState === undefined ? NEUTRAL : CONFUSED;
        }
    }

    /**
     * Uploads the collected facial expression to remote SVM classifier and adds the return classification result.
     * "Confused"/"neutral"/"N/A"
     * @returns {Promise<string>}
     */
    async generateData() {
        // Label (the last parameter) is ignored at INFERENCE stage
        let result = await this.post('/detection', INFERENCE, 0);
        this.dataManager.addFacialExpData(result);
        return "Facial expression resolved."
    }

    /**
     * Starts the facial expression collector.
     */
    start() {
        if (this.camera === undefined) throw new Error("Camera is not defined. Can not start.")
        this.camera.start();
    }

    /**
     * Terminate the facial expression collector.
     */
    end() {
        if (this.camera === undefined) throw new Error("Camera is not defined. Can not stop.")
        this.camera.stop();
    }

    /**
     * Set up the handler for new frames coming in.
     * @param callback - The callback to handle new frames.
     */
    set onFrame(callback) {
        this.camera.h.onFrame = callback;
    }

    /**
     * Set the current state of the expression collector.
     * @param state - One (number) in NOTCALIBRATED, READY, NEUTRAL, CONFUSED.
     */
    set collectingState(state) {
        if (![NOTCALIBRATED, READY, NEUTRAL, CONFUSED].includes(state)) throw new Error("Invalid state. Setting failed.")
        this.currentState = this.collectingStates[state];
        this.currentState.setup();
        this.onFrame = () => {
            this.currentState.collect();
        }
    }

    async post(endpoint, stage, label) {
        // Possible stages:
        // COLLECTION (collecting training data)
        // INFERENCE (inferring cognitive state), where argument label is useless
        // INCREMENT (incremental training)
        this.canvasCtx.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
        let base64ImageData = this.canvasElement.toDataURL();
        let ver = 0;
        if (stage === INFERENCE) {
            ver = this.modelVersion;
        } else if (stage === INCREMENT) {
            ver = ++this.modelVersion;
        }
        let data = {
            img: base64ImageData,
            stage: stage,
            label: label,
            // username: 1,
            ver: this.modelVersion,
            username: userInfo['number'],
            frameId: label === CONFUSED ? this.totalConfused : this.totalNeutral,
        };
        let result = null;
        try {
            if (stage === COLLECTION) {
                // fetch('http://127.0.0.1:8000/detection', { // 172.20.16.10
                fetch('/detection', {
                    method: 'POST',
                    body: JSON.stringify(data),
                    referrerPolicy: "origin",
                })
            } else {
                // await fetch('http://127.0.0.1:8000/detection', { // 172.20.16.10
                await fetch('/detection', {
                    method: 'POST',
                    body: JSON.stringify(data),
                    referrerPolicy: "origin",
                }).then(
                    response => response.json()
                ).then(data => {
                    result = data.body.result;
                    console.log("Confusion detection: " + result)
                })
            }
        } catch (err) {
            console.error(err.name + ": " + err.message);
        }
        return result;
    }
}

/**
 * The SVM collector has multiple states. They all extend this base class.
 */
class CollectorState {
    constructor(facialExpCollector) {
        this.facialExpCollector = facialExpCollector;
    }

    /**
     * Set up some DOM documents.
     */
    setup() {
    }

    /**
     * Collects training data.
     */
    collect() {
    }

    /**
     * Ends the collection of training data.
     */
    collectEnd() {
    }
}

/**
 * The SVM collector is collecting neutral training expressions.
 */
class CollectingNeutralState extends CollectorState {
    constructor(facialExpCollector) {
        super(facialExpCollector);
    }

    setup() {
        document.getElementById("facial-expression-collection-modal-close-btn").disabled = true;
        document.getElementById("facial-expression-collection-modal-btn").disabled = true;
        // Not used in current code.
        // If the collection order is confused expressions first, neutral expressions next, this part should be uncommented.

        // // Change description of facial-expression-instruction-modal
        // document.getElementById("facial-expression-instruction-modal-title")
        // .innerText = "Please collect normal expressions.";
        // document.getElementById("facial-expression-instruction-modal-description")
        // .innerHTML = "Please make your natural faces." +
        // "You will be shown the video captured from the camera to help you check your facial expressions.<br>" +
        // "Click <b>Proceed</b> to continue.";
        // document.getElementById("initImage").src = "media/neutral-small.jpg";
        //
        // // Change description of facial-expression-collection-modal
        // document.getElementById("facial-expression-collection-modal-title")
        // .innerText = "Please make normal expression.";
        // document.getElementById("facial-expression-collection-modal-description")
        // .innerHTML = "Press <b>Collect</b> if you are ready. The collection starts once you click the button.";
    }

    async collect() {
        this.facialExpCollector.collectCtx.drawImage(
            this.facialExpCollector.videoElement, 0, 0, this.facialExpCollector.canvasElement.width,
            this.facialExpCollector.canvasElement.height
        );
        let result = await this.facialExpCollector.post('/detection', COLLECTION, NEUTRAL);
        this.facialExpCollector.totalNeutral -= 1;

        // Update UI
        document.getElementById('facial-expression-collection-modal-description')
            .innerHTML = this.facialExpCollector.totalNeutral.toString() + ' normal frames left...';
        if (this.facialExpCollector.totalNeutral === 0) {
            this.collectEnd();
        }
    }

    collectEnd() {
        // Neutral expressions are collected.
        this.facialExpCollector.collectingState = NOTCALIBRATED;

        // Display initModal to instruct students
        closeModal("facial-expression-collection-modal");
        openModal("facial-expression-instruction-modal");

        document.getElementById("facial-expression-collection-modal-close-btn").disabled = false;
        document.getElementById("facial-expression-collection-modal-btn").disabled = false;
        document.getElementById('confused_btn').disabled = false;
        document.getElementById('neutral_btn').disabled = false;
    }
}

/**
 * The SVM collector is collecting confused training expressions.
 */
class CollectingConfusedState extends CollectorState {
    constructor(facialExpCollector) {
        super(facialExpCollector);
    }

    setup() {
        document.getElementById("facial-expression-collection-modal-close-btn").disabled = true;
        document.getElementById("facial-expression-collection-modal-btn").disabled = true;
        // Not used in current code.
        // The setup is done in the NotCalibratedSate.
    }

    async collect() {
        this.facialExpCollector.collectCtx.drawImage(this.facialExpCollector.videoElement, 0, 0, this.facialExpCollector.canvasElement.width, this.facialExpCollector.canvasElement.height);
        let result = await this.facialExpCollector.post('/detection', COLLECTION, CONFUSED);
        this.facialExpCollector.totalConfused -= 1;

        // Update UI
        document.getElementById('facial-expression-collection-modal-description')
            .innerHTML = this.facialExpCollector.totalConfused.toString() + ' confused frames left...' + '<br>Please <b>frown</b>';
        if (this.facialExpCollector.totalConfused === 0) {
            this.collectEnd();
        }
    }

    collectEnd() {
        // Confused expressions are collected.
        this.facialExpCollector.collectingState = READY;

        // Display initModal to instruct students
        closeModal("facial-expression-collection-modal");

        document.getElementById("facial-expression-collection-modal-close-btn").disabled = false;
        document.getElementById("facial-expression-collection-modal-btn").disabled = false;
        document.getElementById('confused_btn').disabled = false;
        document.getElementById('neutral_btn').disabled = false;
    }
}

/**
 * The collector is still under calibration, but we are not collecting training data now.
 *
 * This happens between the collection of confused and neutral data.
 */
class NotClibratedState extends CollectorState {
    constructor(facialExpCollector) {
        super(facialExpCollector);
    }

    setup() {
        // Change description of facial-expression-instruction-modal
        document.getElementById("facial-expression-instruction-modal-title")
            .innerText = "[Before start] Please collect confused expressions.";
        document.getElementById("facial-expression-instruction-modal-description")
            .innerHTML = "Please make your confused faces (you may <b>frown</b>)." +
            "You will be shown the video captured from the camera to help you check your facial expressions.<br>" +
            "Click <b>Proceed</b> to continue.";
        document.getElementById("initImage").src = "media/confused-small.jpg";

        // Change description of facial-expression-collection-modal
        document.getElementById("facial-expression-collection-modal-title")
            .innerText = "Please make confused expression.";
        document.getElementById("facial-expression-collection-modal-description")
            .innerHTML = "Press <b>Collect</b> if you are ready. The collection starts once you click the button.<br>" +
            "Please <b>frown</b>.";
    }

    collect() {
        this.facialExpCollector.collectCtx.drawImage(
            this.facialExpCollector.videoElement, 0, 0,
            this.facialExpCollector.collectElement.width, this.facialExpCollector.collectElement.height
        );
    }
}

/**
 * Calibration is done. The SVM collector is ready to use.
 */
class ReadyState extends CollectorState {
    constructor(facialExpCollector, onCalibrationEnd) {
        super(facialExpCollector);
        this.onCalibrationEnd = onCalibrationEnd;
    }

    setup() {
        this.onCalibrationEnd();
    }
}

/**
 * Factory function that provides the ExpressionCollector according to the trial setting.
 * @param {Object} settings - Trial setting.
 * @param {boolean} settings.shareCogInfo - Specifies whether the cognitive information is shared.
 * @param {string} settings.facialExpCollectorName - See {@link facialExpCollectorName}.
 * @param {Object} configurations - Configurations of the facial expression collector.
 * @param {number} configurations.total - Total number of confusion training data and neutral training data.
 * @param {function} configurations.onCollectEnd - Callback function after collecting training data.
 * @param {string} configurations.endpoint - Specifies the endpoint of uploading images. Used by pure collectors.
 * @param camera - Represents the web camera with some utilities.
 * @param {DataManager} dataManager - Managing facial expression detection results.
 * @returns {ExpressionCollector}
 */
export default function expressionCollectorFactory(settings, configurations, camera, dataManager) {
    let {shareCogInfo, facialExpCollectorName} = settings;

    if (!shareCogInfo) return new EmptyExpressionCollector(configurations);

    switch (facialExpCollectorName.split("-")[0]) {
        case "svm":
            return new SVMExpressionCollector(configurations, camera, dataManager);
        case "pure":
            let confs = facialExpCollectorName.split("-").splice(1);

            for (let conf of confs) {
                if (conf === "quicksend") configurations.quicksend = true;
            }

            return new PureExpressionCollector(configurations, camera, dataManager);
        case "random":
            return new RandomExpressionCollector(configurations, dataManager);
        case "none":
        default:
            return new EmptyExpressionCollector(configurations);
    }
}