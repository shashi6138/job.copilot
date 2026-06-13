'use strict';
// src/services/geoDetector.js

const INDIA_CITIES = [
  'india','bangalore','bengaluru','hyderabad','mumbai','delhi','ncr','new delhi',
  'pune','chennai','noida','gurgaon','gurugram','kolkata','ahmedabad','jaipur',
  'kochi','trivandrum','coimbatore','chandigarh','mohali','nagpur','indore',
  'bhopal','vizag','visakhapatnam','surat','vadodara','lucknow','kanpur',
  'remote - india','india remote','remote india','work from india',
  'pan india','pan-india','anywhere in india','india only'
];

const REMOTE_KEYWORDS = [
  'remote','wfh','work from home','anywhere','distributed','fully remote',
  'remote-first','remote first','location independent','worldwide','global remote'
];

const HYBRID_KEYWORDS = ['hybrid','partially remote','flexible','wfo/wfh'];

const APAC_KEYWORDS = ['apac','asia pacific','singapore','sydney','melbourne',
  'tokyo','seoul','hong kong','kuala lumpur','jakarta','manila'];

/**
 * Detect geo type from title + location string
 * Returns: 'india' | 'remote' | 'worldwide' | 'hybrid' | 'apac' | 'unknown'
 */
function detectGeo(title = '', location = '') {
  const combined = (title + ' ' + location).toLowerCase();

  // Remote + India = classify as India (more relevant for Shashi)
  const hasIndia  = INDIA_CITIES.some(c => combined.includes(c));
  const hasRemote = REMOTE_KEYWORDS.some(k => combined.includes(k));
  const hasHybrid = HYBRID_KEYWORDS.some(k => combined.includes(k));
  const hasAPAC   = APAC_KEYWORDS.some(k => combined.includes(k));

  if (hasIndia)   return 'india';
  if (hasHybrid)  return 'hybrid';
  if (hasAPAC)    return 'apac';
  if (hasRemote)  return 'remote';
  if (!location.trim()) return 'remote';  // no location = likely remote

  return 'worldwide';
}

/**
 * Detect remote type for the remoteType field
 */
function detectRemoteType(title = '', location = '') {
  const combined = (title + ' ' + location).toLowerCase();
  if (combined.includes('fully remote') || combined.includes('remote-first')) return 'full';
  if (HYBRID_KEYWORDS.some(k => combined.includes(k))) return 'hybrid';
  if (REMOTE_KEYWORDS.some(k => combined.includes(k))) return 'full';
  return 'onsite';
}

module.exports = { detectGeo, detectRemoteType };
