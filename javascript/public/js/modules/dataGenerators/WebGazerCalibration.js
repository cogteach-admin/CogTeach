/**
 * A helper module for WebGazer to calibrate.
 * @constructor
 * @param {Object} configuration Configurations of the WebGaze calibration manager.
 * @param {number} configuration.nClicks - Specifies how many times a user should click on a given dot.
 * @param {Array} configuration.positions - Specifies the positions for dots.
 * @param {function} configuration.onCalibrationEnd - The callback when calibration is completed.
 * @param {boolean} configuration.informLostFace - The callback when calibration is completed.
 *  Each entry in the array should be a mapping setting the CSS style of each dot.
 */
export default class WebGazerCalibration {
    constructor(configuration) {

        const {
            nClicks = 5,
            positions = [
                {cy: "70px", cx: "5%"},
                {cy: "70px", cx: "50%"},
                {cy: "70px", cx: "calc(95% - 340px)"},
                {cy: "50%", cx: "95%"},
                {cy: "95%", cx: "95%"},
                {cy: "95%", cx: "50%"},
                {cy: "95%", cx: "5%"},
                {cy: "50%", cx: "5%"},
                {cy: "50%", cx: "50%"},
            ],
            onCalibrationEnd = () => {},
            informLostFace = false
        } = configuration;

        this.positions = positions;

        //, "margin-left": "340px"
        // Initialize the svg element
        this.svgNS = 'http://www.w3.org/2000/svg';
        this.svg = document.createElementNS(this.svgNS, 'svg');
        this.svg.id = "calibration_svg";
        this.svg.style.position = "absolute";
        this.svg.style.top = "0px";
        this.svg.style.left = "0px";
        this.svg.style.width = "100%";
        this.svg.style.height = "100%";
        this.svg.style.position = 'fixed';
        this.svg.style.backgroundColor = "#BBBBBB";

        // add calibration points
        this.nPoints = positions.length
        for (let i = 0; i < this.nPoints; i++) {
            const calibrationPoint = document.createElementNS(this.svgNS, 'g'),
                circle = document.createElementNS(this.svgNS, 'circle'),
                text = document.createElementNS(this.svgNS, 'text');

            const position = positions[i];

            // configures the properties of circles to be clicked
            for (const [key, value] of Object.entries(position)) {
                circle.setAttribute(key, value + "");
            }
            circle.id = "Pt" + i;
            // circle.style.opacity = "" + 1 / nClicks;
            circle.style.visibility = "hidden";
            circle.setAttribute("r", "10px");
            circle.setAttribute("fill", "#FF6464");
            circle.addEventListener("click", this.onClick.bind(this));

            // configure the text notification for remaining times to click
            text.id = "Pt" + i + "-text";
            text.style.visibility = "hidden";
            text.style.userSelect = "none";
            text.textContent = `${nClicks}`;
            text.setAttribute("x", position.cx.includes("calc") ? Math.floor(0.95 * document.documentElement.clientWidth - 340) + "px" : position.cx);
            text.setAttribute("y", position.cy);
            text.setAttribute("dx", "15");
            text.setAttribute("dy", "5");
            text.setAttribute("font-size", "20px");
            text.setAttribute("fill", "white");

            calibrationPoint.insertAdjacentElement("beforeend", circle);
            calibrationPoint.insertAdjacentElement("beforeend", text);

            this.svg.insertAdjacentElement("beforeend", calibrationPoint);
        }

        this.colorPalette = this.interpolateColor(
            this.h2r("#FF6464"), this.h2r("#ffff00"), nClicks + 1
        ).map(color => this.r2h(color))
        // console.log(this.colorPalette)

        // add the instruction modal box when calibrating
        const template = `<div id="webgazer-calibration-modal" class="modal fade" role="dialog">
                <div class="modal-dialog">
                    <!-- Modal content-->
                    <div class="modal-content">
                        <div class="modal-body">
                            <h4 id="webgazer-calibration-title">
                                WebGazer Calibration Instruction
                            </h4>
                            <p id="webgazer-calibration-description">
                                You need to click on each <span style="background-color:#FF6464;color:white;">red dot</span> that is shown on the screen.<br>
                                As you click, the color will get deeper and when it becomes <span style="background-color:#FFC900">yellow</span>, the calibration for this point is done.<br>
                                There are <b>${this.nPoints}</b> points in total.
                            </p>
                           <div>
                              <img style="max-width: 100%;" src="/media/cali.gif" alt="Calibration">
                            </div>
                            <div class="modal-footer">
                                <button id="webgazer-calibration-modal-close-btn" type="button" class="btn btn-light btn-sm dev" data-dismiss="modal"> Skip [Dev only] </button>
                                <button id="webgazer-calibration-modal-btn" type="button" class="btn btn-primary btn-sm" data-dismiss="modal" disabled> Gaze Detector Loading... </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`
        document.body.insertAdjacentHTML("beforeend", template);

        this.informLostFace = informLostFace;
        if (this.informLostFace) {
            // add the instruction modal box when calibrating
            const faceLostDialog = `<div id="webgazer-missing-face-modal" class="modal fade" role="dialog">
                <div class="modal-dialog">
                    <!-- Modal content-->
                    <div class="modal-content">
                        <div class="modal-body">
                            <h4 id="webgazer-missing-face-title">
                                We can not detect your face :(
                            </h4>
                            <p id="webgazer-missing-face-description">
                                Please adjust your pose until your face is in the middle of the camera. When the bounding box
                                in the corner video is green, you are good to continue! 
                            </p>
                           <div>
                                <figure class="figure">
                                  <img src="/media/instructions/face-shown.png" class="figure-img img-fluid rounded" style="display: flex; max-width: 45%;" alt="Correct position">
                                  <figcaption class="figure-caption text-center">The correct position is indicated by the green box.</figcaption>
                                </figure>
                                <figure class="figure">
                                  <img src="/media/instructions/face-lost.png" class="figure-img img-fluid rounded" style="display: flex; max-width: 45%;" alt="Incorrect position">
                                  <figcaption class="figure-caption text-center">We are unable to detect your face correctly.</figcaption>
                                </figure>
                            </div>
                            <div class="modal-footer">
                                <button id="webgazer-missing-face-modal-close-btn" type="button" class="btn btn-light btn-sm dev" data-dismiss="modal"> Skip [Dev only] </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`
            document.body.insertAdjacentHTML("beforeend", faceLostDialog);
        }

        // internal states to record the calibration process
        this.nClicks = nClicks;
        this.pointCalibrate = 0;
        this.calibrationPoints = {};

        // onCalibrationEnd
        this.onCalibrationEnd = onCalibrationEnd;

        // Handling resize of window
        window.addEventListener('resize', this.onresize.bind(this));
    }

    init(onConfirmCallback = () => {
    }) {
        document.body.insertAdjacentElement("beforeend", this.svg);
        document.getElementById("Pt0").style.visibility = "visible";
        document.getElementById("Pt0-text").style.visibility = "visible";

        document.getElementById("webgazer-calibration-modal").style.display = "block";
        document.getElementById("webgazer-calibration-modal").className = "modal show";

        document.getElementById("webgazer-calibration-modal-close-btn").onclick = () => {
            document.getElementById("webgazer-calibration-modal").style.display = "none"
            document.getElementById("webgazer-calibration-modal").className = document.getElementById("webgazer-calibration-modal").className.replace("show", "fade")
        };
        document.getElementById("webgazer-calibration-modal-btn").onclick = () => {
            // console.log(document.getElementById("webgazer-calibration-modal").className)
            document.getElementById("webgazer-calibration-modal").style.display = "none"
            document.getElementById("webgazer-calibration-modal").className = document.getElementById("webgazer-calibration-modal").className.replace("show", "fade")
            // console.log(document.getElementById("webgazer-calibration-modal").className)
            // console.log(document.getElementById("webgazer-calibration-modal").className)

            // callback function to be run when user proceed to calibration
            onConfirmCallback();
        };

        if (this.informLostFace) {
            this.faceLostDialogVisible = false;
            this.informLostFaceInterval = setInterval(this.checkEyesInValidationBox.bind(this), 200)
        }
    }

    /**
     * Check whether the user's eye positions are still inside the bounding box.
     * If not, a modal box will show up to enforce the user to adjust their head position.
     * Used with setInterval for periodically check.
     */
    checkEyesInValidationBox() {
        const feedbackBox = document.getElementById("webgazerFaceFeedbackBox");

        if (!feedbackBox) return

        const color = feedbackBox.style.borderColor;
        if (color === "green") {
            // check if the blocking dialog is displayed
            // if so, hide the dialog box
            if (this.faceLostDialogVisible) {
                closeModal("webgazer-missing-face-modal");
                this.faceLostDialogVisible = false;
            }
            // if not, do nothing
        } else {
            // check if the blocking dialog is displayed
            // if not, show the dialog box
            if (!this.faceLostDialogVisible) {
                openModal("webgazer-missing-face-modal");
                this.faceLostDialogVisible = true;
            }
            // if so, do nothing
        }
    }

    calibrate() {
        const button = document.getElementById("webgazer-calibration-modal-btn");
        button.disabled = false;
        button.innerText = "Proceed";
    }

    /**
     * Updates the presentation of calibration points after each click.
     * @param event - The click event.
     */
    onClick(event) {
        const circle = event.target;
        const id = circle.id;
        let index = id.split("");
        index = +index[index.length - 1];

        const text = document.getElementById("Pt" + index + "-text");

        if (!this.calibrationPoints[id]) { // initialises if not done
            this.calibrationPoints[id] = 0;
        }
        this.calibrationPoints[id]++; // increments values

        if (this.calibrationPoints[id] === this.nClicks) { //only turn to yellow after 5 clicks
            circle.setAttribute("fill", "yellow");
            text.remove();
            this.pointCalibrate++;

            // Exit point of calibration procedure!
            if (this.pointCalibrate === this.nPoints) {
                // calibration is done
                // The following will run after onClick is returned.
                // Otherwise the svg element can not be properly removed.
                setTimeout(() => {
                    this.svg.remove();
                    window.removeEventListener('resize', this.onresize.bind(this));
                    clearInterval(this.informLostFaceInterval);
                    this.onCalibrationEnd();
                }, 0)
                return;
            }

            document.getElementById("Pt" + (index + 1)).style.visibility = "visible";
            document.getElementById("Pt" + (index + 1) + "-text").style.visibility = "visible";
        } else if (this.calibrationPoints[id] < 5) {
            //Gradually increase the opacity of calibration points when click to give some indication to user.
            // circle.style.opacity = (this.calibrationPoints[id] + 1) / this.nClicks;
            circle.setAttribute("fill", this.colorPalette[this.calibrationPoints[id]]);
            text.textContent = `${this.nClicks - this.calibrationPoints[id]}`
        }
    }

    /**
     * Adjust the location of points and remaining click times prompts when the browser is resized.
     * @param event - Tge resize event.
     */
    onresize(event) {
        const svg = document.getElementById("calibration_svg");
        if (svg) {
            svg.style.width = document.documentElement.clientWidth;
            svg.style.height = document.documentElement.clientHeight;
        }

        // adjust the points
        for (let i = 0; i < this.nPoints; i++) {
            const circle = document.getElementById("Pt" + i);
            if (circle) {
                const position = this.positions[i];
                for (const [key, value] of Object.entries(position)) {
                    circle.setAttribute(key, value);
                }
            }
        }
    }

    // Converts a #ffffff hex string into an [r,g,b] array
    h2r = function (hex) {
        let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
        ] : null;
    };

    // Inverse of the above
    r2h = function (rgb) {
        return "#" + ((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1);
    };

    /**
     * Returns a lit of interpolated colors betwenn two given colors and the step.
     */
    interpolateColor = function (color1, color2, nPoints) {
        let results = [];

        for (let i = 0; i < nPoints; i++) {
            let factor = 1 - i / (nPoints - 1);
            // console.log(factor);
            let color = new Array(3);
            for (let j = 0; j < 3; j++) {
                color[j] = Math.round(factor * color1[j] + (1 - factor) * color2[j]);
            }
            results[i] = color;
        }

        return results;
    };
}

