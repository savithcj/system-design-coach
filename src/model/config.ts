/**
 * The one place the local model is chosen. Pinned: bump on purpose, after running the in-browser eval page (/evals.html).
 * Llama 3.2 3B Instruct at 4 bit is a non-thinking instruct model of about 2.3 GB of GPU memory, which keeps clear of the
 * limits that made larger models fail to cache (docs/06). UNVERIFIED on the owner's machines until the eval page has run.
 */
export const LOCAL_MODEL_ID = 'Llama-3.2-3B-Instruct-q4f16_1-MLC'

/**
 * Whether a production build loads the local model without being asked. docs/08 requires 0% spoiler leaks and 0% ghost
 * components from the eval page before this is turned on, so it stays off until that has been run on a real model.
 * `?coach=local` turns it on for one visit; `?coach=scripted` forces it off.
 */
export const LOCAL_MODEL_DEFAULT_ON = false
