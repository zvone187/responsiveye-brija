import dotenv from "dotenv";
import FS from "fs";

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || "production";
const DEFAULT_LOG_LEVEL = NODE_ENV === "production" ? "info" : "debug";

export default {
    NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL || DEFAULT_LOG_LEVEL,
    SERVER_TYPE: process.env.SERVER_TYPE,
    PORT: parseInt(process.env.PORT, 10) || 3000,
    DATABASE_URL: process.env.DATABASE_URL,
    SOCKETIO_PORT: process.env.SOCKETIO_PORT || 4220,
    SOCKETIO_ALLOWED_ORIGINS: JSON.parse(process.env.SOCKETIO_ALLOWED_ORIGINS || '[]'),
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_PASS: process.env.REDIS_PASS,
    BACKEND_TOKEN: process.env.BACKEND_TOKEN,
    TEST_SHOPIFY_STORE: process.env.TEST_SHOPIFY_STORE,
    NODEMAILER_HOST: process.env.NODEMAILER_HOST || "localhost",
    NODEMAILER_PORT: process.env.NODEMAILER_PORT || 25,
    NODEMAILER_USER: process.env.NODEMAILER_USER || undefined,
    NODEMAILER_PASS: process.env.NODEMAILER_PASS || undefined,
    NODEMAILER_SECURE: process.env.NODEMAILER_SECURE || false,
    NODEMAILER_SHOPIFY_HOST: process.env.NODEMAILER_SHOPIFY_HOST || "localhost",
    NODEMAILER_SHOPIFY_PORT: process.env.NODEMAILER_SHOPIFY_PORT || 25,
    NODEMAILER_SHOPIFY_USER: process.env.NODEMAILER_SHOPIFY_USER || undefined,
    NODEMAILER_SHOPIFY_PASS: process.env.NODEMAILER_SHOPIFY_PASS || undefined,
    NODEMAILER_SHOPIFY_SECURE: process.env.NODEMAILER_SHOPIFY_SECURE || false,
    SHOPIFY: {
        PRODUCTS_TO_CHECK: 1,
        MAX_PRODUCTS_TO_CHECK: 30
    },
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
    AWS_SECRET_KEY: process.env.AWS_SECRET_KEY || '',
    AWS_VISUAL_ERROR_PROCESSING_SPOT_FLEET_ID: process.env.AWS_VISUAL_ERROR_PROCESSING_SPOT_FLEET_ID,
    AWS_PAGE_DOWNLOAD_PROCESSING_SPOT_FLEET_ID: process.env.AWS_PAGE_DOWNLOAD_PROCESSING_SPOT_FLEET_ID,
    AWS_FUNCTIONAL_TESTING_SPOT_FLEET_ID: process.env.AWS_FUNCTIONAL_TESTING_SPOT_FLEET_ID,
    SAVE_DATA_DESTINATION: process.env.SAVE_DATA_DESTINATION || 'local',
    MONITOR: process.env.MONITOR === 'true',
    processML: process.env.PROCESS_ML === 'true',
    saveDebugFilesToS3: process.env.SAVE_DEBUG_FILES_TO_S3 === 'true',
    MLScriptLocation: process.env.ML_SCRIPT_LOCATION,
    threshold_opacity: parseFloat(process.env.THRESHOLD_OPACITY),
    lowest_processing_resolution: JSON.parse(process.env.LOWEST_PROCESSING_RESOLUTION),
    highest_processing_resolution: JSON.parse(process.env.HIGHEST_PROCESSING_RESOLUTION),
    processing_resolution_step: JSON.parse(process.env.PROCESSING_RESOLUTION_STEP),
    debug: process.env.DEBUG ?
        (process.env.DEBUG.includes('.debug') ? JSON.parse(FS.readFileSync(process.env.DEBUG, 'utf8')) :
            (process.env.DEBUG === '*' ?
                process.env.DEBUG : JSON.parse(process.env.DEBUG))) : false,
    defaultQueueJobPriority: process.env.DEFAULT_QUEUE_JOB_PRIORITY,
    defaultQueueJobAttempts: process.env.DEFAULT_QUEUE_JOB_ATTEMPTS,
    overlap_error_rgba: JSON.parse(process.env.OVERLAP_ERROR_RGBA),
    maxParallelSeleniumDrivers: process.env.MAX_PARALLEL_SELENIUM_DRIVERS || 1,
    downloadPageChromeScriptPath: process.env.DOWNLOAD_PAGE_CHROME_SCRIPT_PATH,
    seleniumBrowserAgent: process.env.SELENIUM_BROWSER_AGENT,

    imgArtefactsThreshold: 20,
    marginOfErrForSiblingTreatedAsBg: 1.01,
    overlapMarginOfError: 1,
    showExactOverlapsOnFinalImage: process.env.SHOW_EXACT_OVERLAPS === 'true',
    ignoreOverlapThreshold: 0.97,

    rowColumnDeviation: 5,
    elementDeviation: 1,
    pageSizeDeviation: 2,

    HTMLElementProcessingTypeMap: {
        image: ['canvas', 'img', 'video', 'iframe', 'svg', 'picture'], // TODO don't process children
        text: ['a', 'button', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'b', 'i', 'p', 'button', 'input', 'strong', 'textarea', 'span'],
        ignore: ['br', 'thead', 'tbody', 'style', 'script', 'audio', 'body', 'head', 'html', 'meta', 'noframes', 'noscript', 'title']
    },

    skipTagsChildren: ["svg"],

    cssKeep: [
        "backgroundColor",
        "display",
        "font-size",
        "height",
        "line-height",
        "max-height",
        "max-width",
        "min-height",
        "min-width",
        "opacity",
        "overflow-x",
        "overflow-y",
        "padding-top",
        "padding-right",
        "padding-bottom",
        "padding-left",
        "position",
        "visibility",
        "width"
    ],

    breakingElements: {
        returnFormat: "json",
        minWordsTextElement: 2,
        step: 4,
        skipTags: [],
        skipTagsParent: ["iframe"],
        enabled: process.env.ENABLE_BREAKING_ELEMENTS === 'true'
    },

    overlapProcessing: {
        step: 16,
        enabled: process.env.ENABLE_OVERLAP_PROCESSING === 'true'
    },

    workerQueues: {
        FUNCTIONAL_TESTING: 'functional-error-processing',
        ERROR_PROCESSING: 'visual-error-processing',
        GUI_PROCESSING: 'gui-processing',
        SHOPIFY_TEST_PROCESSING: 'shopify-test-processing'
    },

    s3Buckets: {
        debug: 'responsiveyealpha',
        public: 'responsiveyealphapublic',
        downloadedPages: 'page.responsiveye.com',
        functionalTesting: 'responsiveyefunctionaltesting'
    },

    devices: {
        mobile: {
            width: 480,
            height: 800
        },
        tablet: {
            width: 768,
            height: 1024
        },
        laptop: {
            width: 1024,
            height: 768
        },
        desktop: {
            width: 1920,
            height: 1080
        }
    }
};
