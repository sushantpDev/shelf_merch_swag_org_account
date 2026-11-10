/**
 * Hosts from the OpenAI Measurement Pixel CSP guide:
 * https://developers.openai.com/ads/measurement-pixel
 * Listing them does not load the pixel. The browser snippet stays off until
 * consent is granted, VITE_OPENAI_PIXEL_ID is set, and automatic advanced
 * matching has been reviewed.
 *
 * script-src-elem is left unset so it inherits script-src. connect-src already
 * allows https:, which covers GA4 and Meta collection. BROWSER_TAG_SCRIPT_SRC
 * adds the GTM, GA4, and Meta script hosts. CSP_MODE stays report-only. The
 * inline consent bootstrap still needs a nonce before that policy is enforced.
 */
export const OPENAI_MEASUREMENT_PIXEL_CSP = {
  scriptSrc: ['https://bzrcdn.openai.com'],
  connectSrc: ['https://bzr.openai.com', 'https://bzrcdn.openai.com'],
  imgSrc: ['https://bzr.openai.com'],
};

export const BROWSER_TAG_SCRIPT_SRC = [
  'https://www.googletagmanager.com',
  'https://www.google-analytics.com',
  'https://connect.facebook.net',
];

export function mergeBrowserTagCsp(directives) {
  return {
    ...directives,
    scriptSrc: [...directives.scriptSrc, ...BROWSER_TAG_SCRIPT_SRC],
  };
}

export function mergeOpenAiPixelCsp(directives) {
  return {
    ...directives,
    scriptSrc: [...directives.scriptSrc, ...OPENAI_MEASUREMENT_PIXEL_CSP.scriptSrc],
    connectSrc: [...directives.connectSrc, ...OPENAI_MEASUREMENT_PIXEL_CSP.connectSrc],
    imgSrc: [...directives.imgSrc, ...OPENAI_MEASUREMENT_PIXEL_CSP.imgSrc],
  };
}
