/**
 * Used only in ConfusionCollection.html demo.
 */
class WebGazerCalibration {
    constructor(nClicks = 5, positions = [
        {cy: "70px", cx: "340px"},
        {cy: "70px", cx: "50%"},
        {cy: "70px", cx: "95%"},
        {cy: "50%", cx: "95%"},
        {cy: "95%", cx: "95%"},
        {cy: "95%", cx: "50%"},
        {cy: "95%", cx: "5%"},
        {cy: "50%", cx: "5%"},
        {cy: "50%", cx: "50%"},
    ]) {
        //, "margin-left": "340px"
        // Initialize the svg element
        this.svgNS = 'http://www.w3.org/2000/svg';
        this.svg = document.createElementNS(this.svgNS, 'svg');
        this.svg.id = "calibration_svg";
        this.svg.style.position = "absolute";
        this.svg.style.top = "0px";
        this.svg.style.left = "0px";
        this.svg.style.width = document.documentElement.clientWidth;
        this.svg.style.height = document.documentElement.clientHeight;
        this.svg.style.position = 'fixed';
        this.svg.style.backgroundColor = "#BBBBBB";

        // add calibration points
        this.nPoints = positions.length
        for (let i = 0; i < this.nPoints; i++) {
            const circle = document.createElementNS(this.svgNS, 'circle');
            const position = positions[i];
            for (const [key, value] of Object.entries(position)) {
                circle.setAttribute(key, value);
            }
            circle.id = "Pt" + i;
            circle.style.opacity = "" + 1 / nClicks;
            circle.style.visibility = "hidden";
            circle.setAttribute("r", "10px");
            circle.setAttribute("fill", "#FF6464");
            circle.addEventListener("click", this.onClick.bind(this))
            this.svg.insertAdjacentElement("beforeend", circle);
        }

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
                            <div class="modal-footer">
                                <button id="webgazer-calibration-modal-close-btn" type="button" class="btn btn-light btn-sm dev" data-dismiss="modal"> Skip [Dev only] </button>
                                <button id="webgazer-calibration-modal-btn" type="button" class="btn btn-primary btn-sm" data-dismiss="modal"> Proceed </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`
        document.body.insertAdjacentHTML("beforeend", template);

        // internal states to record the calibration process
        this.nClicks = nClicks;
        this.pointCalibrate = 0;
        this.calibrationPoints = {};

        // onCalibrationEnd
        this.onCalibrationEnd = () => {
        };

        // Handling resize of window
        window.addEventListener('resize', this.onresize);
    }

    calibrate() {
        document.body.insertAdjacentElement("beforeend", this.svg);
        document.getElementById("Pt0").style.visibility = "visible";

        document.getElementById("webgazer-calibration-modal").style.display = "block";
        document.getElementById("webgazer-calibration-modal").className = "modal show";

        document.getElementById("webgazer-calibration-modal-close-btn").onclick = () => {
            document.getElementById("webgazer-calibration-modal").style.display = "none"
            document.getElementById("webgazer-calibration-modal").className += document.getElementById("webgazer-calibration-modal").className.replace("show", "fade")
        };
        document.getElementById("webgazer-calibration-modal-btn").onclick = () => {
            console.log(document.getElementById("webgazer-calibration-modal").className)
            document.getElementById("webgazer-calibration-modal").style.display = "none"
            document.getElementById("webgazer-calibration-modal").className += document.getElementById("webgazer-calibration-modal").className.replace("show", "fade")
            console.log(document.getElementById("webgazer-calibration-modal").className)
            console.log(document.getElementById("webgazer-calibration-modal").className)

        };
    }

    onClick(event) {
        const circle = event.target;
        const id = circle.id;
        let index = id.split("");
        index = +index[index.length - 1];

        if (!this.calibrationPoints[id]) { // initialises if not done
            this.calibrationPoints[id] = 0;
        }
        this.calibrationPoints[id]++; // increments values

        if (this.calibrationPoints[id] === this.nClicks) { //only turn to yellow after 5 clicks
            circle.setAttribute("fill", "yellow");
            this.pointCalibrate++;

            // Exit point of calibration procedure!
            if (this.pointCalibrate === this.nPoints) {
                // calibration is done
                // The following will run after onClick is returned.
                // Otherwise the svg element can not be properly removed.
                setTimeout(() => {
                    this.svg.remove();
                    window.removeEventListener('resize', this.onresize);
                    this.onCalibrationEnd();
                }, 0)
                return;
            }

            document.getElementById("Pt" + (index + 1)).style.visibility = "visible";
        } else if (this.calibrationPoints[id] < 5) {
            //Gradually increase the opacity of calibration points when click to give some indication to user.
            circle.style.opacity = (this.calibrationPoints[id] + 1) / this.nClicks;
        }
    }

    onresize(event) {
        const svg =  document.getElementById("calibration_svg");
        svg.style.width = document.documentElement.clientWidth;
        svg.style.height = document.documentElement.clientHeight;
    }
}

