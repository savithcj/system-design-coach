/**
 * The one place the local model is chosen. Pinned: bump on purpose, after running the in-browser eval page (/evals.html).
 * Llama 3.2 3B Instruct at 4 bit is a non-thinking instruct model of about 2.3 GB of GPU memory, which keeps clear of the
 * limits that made larger models fail to cache (docs/06). UNVERIFIED on the owner's machines until the eval page has run.
 */
export const LOCAL_MODEL_ID = 'Llama-3.2-3B-Instruct-q4f16_1-MLC'

/**
 * Whether the app loads the local model without being asked (needs WebGPU). On: the model is the coach's voice. The scripted
 * wording stays as the fallback seed, so a failed or missing model never leaves the learner without a coach.
 * `?coach=scripted` forces it off; automated browsers (navigator.webdriver) never download it.
 */
export const LOCAL_MODEL_DEFAULT_ON = true
