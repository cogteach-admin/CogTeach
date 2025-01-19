import DataGenerator from "./DataGenerator.js";

/**
 * The data generator who listens to the mouse movement of the user.
 */
class MouseEventListener extends DataGenerator {
    /**
     * Creates a mouse click listener.
     * @param dataManager - The data manager that gathers all data to be posted.
     */
    constructor(dataManager) {
        super();
        this.dataManager = dataManager;
    }

    start() {
        document.getElementById("container").addEventListener("mousemove", this.mousemoveListener.bind(this))
        document.getElementById("container").addEventListener("click", this.mouseclickListener.bind(this))
    }

    end() {
        document.getElementById("container").removeEventListener("mousemove", this.mousemoveListener.bind(this))
        document.getElementById("container").removeEventListener("click", this.mouseclickListener.bind(this))
    }

    generateData() {
    }

    /**
     * The callback function when user moves mouse.
     * @param {MouseEvent} e The click event of mouse.
     */
    mousemoveListener(e) {
        // console.log("[Mouse Move]", new Date(), e.clientX, e.clientY);
        this.dataManager.addMouseEvent(e.clientX, e.clientY, "mousemove", "NaN");
    }

    /**
     * The callback function when user clicks.
     * @param {MouseEvent} e The click event of mouse.
     */
    mouseclickListener(e) {
        this.dataManager.addMouseEvent(e.clientX, e.clientY, "click", "NaN");
    }

    /**
     * The callback function when user clicks on an AoI.
     * @param {MouseEvent} e The click event of mouse.
     * @param {SaliencyAoI} d - The data bound to the SVG, i.e., SaliencyAoI
     */
    aoiMouseclickListener(e, d) {
        this.dataManager.addMouseEvent(e.clientX, e.clientY, "click", d.aoiId);
        // record only once here.
        // otherwise a click will also bubble to the document-level listener.
        e.stopPropagation();
    }
}

/**
 * Factory function that provides the MouseEventListener.
 * @param {DataManager} dataManager - Managing gaze estimations.
 * @returns {MouseEventListener}
 */
export default function mouseEventListenerFactory(dataManager) {
   return new MouseEventListener(dataManager)
}