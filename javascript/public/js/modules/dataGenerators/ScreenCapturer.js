// =============================================
// Screenshot Capturer
// =============================================
import DataGenerator from "./DataGenerator.js";

/**
 * Screen capturers capture the slide that is currently being shared.
 *
 * This is only used for synchronous experiment, where instructors deliver lectures to students.
 */
class ScreenCapturer extends DataGenerator {
    constructor() {
        super();

        this.timeCalled = 0;
        this.screenshot_hash = "";
    }

    /**
     * Convert base64-encoded string o bolb instance.
     * Not used but left for possible later use.
     * Copied from online source.
     * @param b64Data - The base64 strong.
     * @param contentType
     * @param sliceSize
     * @returns {Blob}
     */
    b64toBlob(b64Data, contentType = '', sliceSize = 512) {
        const byteCharacters = atob(b64Data);
        const byteArrays = [];

        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            const slice = byteCharacters.slice(offset, offset + sliceSize);

            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }

            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }

        const blob = new Blob(byteArrays, {type: contentType});
        return blob;
    }

    generateData() {
    }

    init() {
    }

    calibrate() {
    }

    start() {
    }

    end() {
    }
}

/**
 * The screen capturer that captures slide using canvas element.
 * Used when hosting the meeting using Zoom iframe.
 *
 * Currently this is not used.
 * The sync experiment has changed to Jisti, and async experiment does not need to capture screen.
 */
class CanvasCapturer extends ScreenCapturer {
    constructor(configurations, dataManager) {
        super();

        let {onCalibrateEnd} = configurations;

        this.onCalibrateEnd = onCalibrateEnd;
        this.dataManager = dataManager;
    }

    /**
     * The name of the canvas element is found by examining all elements in the page.
     * It may be changed in later versions.
     */
    init() {
        this.iframe = document.getElementById("websdk-iframe");
        this.canvas = this.iframe.contentWindow.document.querySelector("canvas.sharee-container__canvas")
    }

    calibrate() {
        this.onCalibrateEnd();
    }

    async generateData() {
        this.timeCalled += 1;
        if (this.timeCalled % updateInterval !== 0) {
            // Only generate the random data when being called this.updateInterval times
            return "Not reach updateInterval."
        }

        let b64Frame = this.canvas.toDataURL("image/png", 1.0).split(",")[1];
        await this.dataManager.addScreenshot(
            b64Frame
        );
        // Return value is wrapped in Promise.resolve(return value).
        return "Screenshot added."
    }

    /**
     * Download the screen capturer to check if it is working.
     *
     * The exemplar usage is to add this method as the event listen to the "click" event of a button on the page.
     * Do not forget to call bind() when assigning the event listener.
     */
    examine() {
        let image = this.canvas.toDataURL("image/png", 1.0).replace("image/png", "image/octet-stream");
        let link = document.createElement('a');
        link.download = "screensharing_snapshot.png";
        link.href = image;
        console.log(image)
        link.click();
    }
}

/**
 * The screen capturer that captures slide using APIs exposed by Jitsi.
 *
 * Do not use this when the meeting is hold using Zoom.
 * @see {@link https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe-functions#capturelargevideoscreenshot}.
 * @param configurations - The configuration object describing callbacks of the screen capturer.
 * @param dataManager - The data manager that gathers all data to be posted.
 */
class VideoCapturer extends ScreenCapturer {
    constructor(configurations, dataManager) {
        super();
        let {onCalibrateEnd} = configurations;

        this.onCalibrateEnd = onCalibrateEnd;
        this.dataManager = dataManager;
    }

    calibrate() {
        this.onCalibrateEnd();
    }

    async generateData() {
        this.timeCalled += 1;
        if (this.timeCalled % updateInterval !== 0) {
            // Only generate the random data when being called this.updateInterval times
            return "Not reach updateInterval."
        }

        let data = await _jitsi.captureLargeVideoScreenshot();
        // data is an Object with only one param, dataURL
        // data.dataURL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABQAA...

        const b64Frame = data.dataURL.split(",")[1];
        const b64_hash = cyrb53(b64Frame);
        console.log("Screenshot generated. Hash: " + b64_hash);
        if (b64_hash === this.screenshot_hash) {
            console.log("Same screenshot. Nothing new.")
            return "Hash of screenshot not changed."
        } else {
            console.log("New screenshot is detected.")

            // Calculate the padding sizes
            const maxH = document.documentElement.clientHeight,
                iframeHeight = _jitsi.getIFrame().getBoundingClientRect().height,
                iframeWidth = _jitsi.getIFrame().getBoundingClientRect().width,
                yOffset = _jitsi.getIFrame().getBoundingClientRect().top;

            await this.dataManager.addScreenshot(
                b64Frame, {top: yOffset, availableHeight: iframeHeight, availableWidth: iframeWidth}
            );
            this.screenshot_hash = b64_hash;
            // In TeacherDataManager we have duplicate version of slideId
            slideId += 1;
            return "Screenshot added."
        }
    }

    async examine() {
        let data = await _jitsi.captureLargeVideoScreenshot();
        let image = data.dataURL.replace("image/png", "image/octet-stream");
        let link = document.createElement('a');
        link.download = "screensharing_snapshot.png";
        link.href = image;
        link.click();
    }
}

/**
 * The screen capturer that captures slide using the screen sharing function provided by the browser.
 *
 * This method seems to work for all cases, but it is not currently used since using the API offered
 * by Jitsi is more straightforward.
 * @param configurations - The configuration object describing callbacks of the screen capturer.
 * @param dataManager - The data manager that gathers all data to be posted.
 */
class ScreenSharingCapturer extends ScreenCapturer {
    constructor(configurations, dataManager) {
        super();
        let {screenSharingConfig, onCalibrateEnd} = configurations;

        this.onCalibrateEnd = onCalibrateEnd;
        this.dataManager = dataManager;
        this.config = screenSharingConfig;

        this.captureStream = undefined;
        this.screenVideo = document.createElement("video");
        this.screenCanvas = document.createElement("canvas");
        this.screenCanvasContext = this.screenCanvas.getContext("2d");
    }

    init() {
        this.screenCanvas.width = document.documentElement.clientWidth;
        this.screenCanvas.height = document.documentElement.clientHeight;

        // update the width and height information when the browser if resized.
        window.addEventListener('resize', () => {
            let handler = this.init.bind(this);
            handler();
            console.debug("Resize is triggered. Changing the video rect.");
        });
    }

    /**
     * Setup the screen sharing stream.
     */
    calibrate() {
        navigator.mediaDevices.getDisplayMedia(this.config).then(
            (stream) => {
                this.captureStream = stream;
                this.screenVideo.srcObject = this.captureStream;
                this.onCalibrateEnd();
            }
        ).catch((err) => {
            throw err
        })
    }

    async generateData() {
        this.timeCalled += 1;
        if (this.timeCalled % updateInterval !== 0) {
            // Only generate the random data when being called this.updateInterval times
            return "Not reach updateInterval."
        }

        this.screenCanvasContext.drawImage(
            this.screenVideo, 0, 0,
            document.documentElement.clientWidth, document.documentElement.clientHeight
        );

        const b64Frame = this.screenCanvas.toDataURL("image/png", 1.0).split(",")[1];
        await this.dataManager.addScreenshot(
            b64Frame
        );
        return "Screenshot added."
    }

    examine() {
        const frame = this.screenCanvas.toDataURL("image/png", 1.0)
            .replace("image/png", "image/octet-stream");

        console.debug(frame.split(",")[1])
        console.debug(this.b64toBlob(frame.split(",")[1], "image/png"));

        let downloadA = document.createElement("a");
        downloadA.download = "screensharing_snapshot.png";
        downloadA.href = frame;
        downloadA.click();
    }

    start() {
        this.screenVideo.play();
    }

    pause() {
        this.screenVideo.pause();
    }

    end() {
        this.captureStream.getTracks().forEach(track => track.stop());
    }
}

/**
 * Check the hash of new screenshot (b64) is the same as previous one.
 * @see https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript/52171480#52171480
 * @param {string} str - Base64 encoded screenshot.
 * @param seed - random seed.
 * @returns {number} - Hash result.
 */
function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
    h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1>>>0);
}

/**
 * Factory function that provides the ScreenCapturer according to the trial setting.
 * @param {Object} settings - Trial setting.
 * @param {string} settings.screenCapturerName - See {@link screenCapturerName}.
 * @param {Object} configurations - Configurations of the screen capturer.
 * @param {Object} configurations.screenSharingConfig - Define the configurations for capturer based on screen sharing
 * @param {function} configurations.onCalibrateEnd - Callback for triggering the next step.
 * @param {DataManager} dataManager - Managing screenshots.
 * @returns {ScreenCapturer}
 */
export default function screenCapturerFactory(settings, configurations, dataManager) {
    let {screenCapturerName} = settings;

    switch (screenCapturerName) {
        case "screensharing":
            return new ScreenSharingCapturer(configurations, dataManager);
        case "video":
            return new VideoCapturer(configurations, dataManager);
        case "canvas":
            return new CanvasCapturer(configurations, dataManager);
        case "none":
        default:
            return new VideoCapturer(configurations, dataManager);
    }
}