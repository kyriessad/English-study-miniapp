const {
  downloadDiagnosticTestAudio,
  downloadPronunciationAudio,
  getLastTtsRequestId,
  getLexicalInfo,
  logTtsDiagnostic
} = require('./apiClient');

const VOICE_STORAGE_KEY = 'englishCard.pronunciationVoice.v1';
const VALID_VOICES = ['male', 'female'];
const DEFAULT_VOICE = 'male';

function getStoredVoice() {
  try {
    var value = wx.getStorageSync(VOICE_STORAGE_KEY);
    if (value && VALID_VOICES.indexOf(value) >= 0) {
      return value;
    }
  } catch (_) {}
  return DEFAULT_VOICE;
}

function saveStoredVoice(voice) {
  try {
    wx.setStorageSync(VOICE_STORAGE_KEY, voice);
  } catch (_) {}
}

function normalizeDisplayPhonetic(value) {
  const clean = String(value || '').trim().replace(/^[/\[]+|[/\]]+$/g, '').trim();
  return clean ? '/' + clean + '/' : '';
}

/** Build one pure phonetic string when every word has a phonetic. */
function buildWordPhoneticsDisplay(wordPhonetics) {
  if (!Array.isArray(wordPhonetics) || wordPhonetics.length === 0) {
    return '';
  }

  var parts = [];
  for (var i = 0; i < wordPhonetics.length; i++) {
    var item = wordPhonetics[i];
    var phonetic = (item && item.phonetic) ? String(item.phonetic).trim() : '';
    if (!item || !String(item.word || '').trim() || !phonetic) {
      return '';
    }
    parts.push(phonetic.replace(/^[/\[]+|[/\]]+$/g, '').trim());
  }

  if (parts.some(function (part) { return !part; })) {
    return '';
  }
  return normalizeDisplayPhonetic(parts.join(' '));
}

/**
 * Determine the effective phonetic display string from a lexical info response.
 * Returns { phoneticDisplay, phoneticSource, isWordLevel }.
 */
function resolvePhoneticDisplay(info) {
  if (!info) {
    return { phoneticDisplay: '', phoneticSource: '', isWordLevel: false };
  }

  // Priority 1: full-text phonetic (skip placeholder "(none)" values)
  if (info.phonetic && String(info.phonetic).toLowerCase() !== '(none)') {
    return {
      phoneticDisplay: normalizeDisplayPhonetic(info.phonetic),
      phoneticSource: info.phoneticSource || '',
      isWordLevel: false
    };
  }

  // Priority 2: word-level phonetics
  if (Array.isArray(info.wordPhonetics) && info.wordPhonetics.length > 0) {
    var display = buildWordPhoneticsDisplay(info.wordPhonetics);
    if (display) {
      return {
        phoneticDisplay: display,
        phoneticSource: 'ecdict-word',
        isWordLevel: true
      };
    }
  }

  return { phoneticDisplay: '', phoneticSource: '', isWordLevel: false };
}

function audioState(audio) {
  if (!audio) {
    return {};
  }
  return {
    requestId: getLastTtsRequestId(),
    src: String(audio.src || ''),
    volume: Number(audio.volume),
    duration: Number(audio.duration),
    currentTime: Number(audio.currentTime),
    paused: Boolean(audio.paused)
  };
}

function createPronunciationController(page) {
  let lexicalRequestId = 0;
  let audioContext = null;
  let audioText = '';
  let inflightRequestKey = null;
  let currentVoice = getStoredVoice();

  function setState(patch) {
    page.setData(patch);
  }

  function ensureAudioContext() {
    if (audioContext) {
      return audioContext;
    }

    audioContext = wx.createInnerAudioContext();
    audioContext.obeyMuteSwitch = false;

    audioContext.onCanplay(() => {
      logTtsDiagnostic('audio_on_canplay', audioState(audioContext));
    });

    audioContext.onPlay(() => {
      logTtsDiagnostic('audio_on_play', audioState(audioContext));
      setState({
        pronunciationLoading: false,
        pronunciationPlaying: true
      });
    });

    audioContext.onWaiting(() => {
      logTtsDiagnostic('audio_on_waiting', audioState(audioContext));
    });

    audioContext.onEnded(() => {
      logTtsDiagnostic('audio_on_ended', audioState(audioContext));
      setState({
        pronunciationLoading: false,
        pronunciationPlaying: false
      });
    });

    audioContext.onStop(() => {
      setState({
        pronunciationLoading: false,
        pronunciationPlaying: false
      });
    });

    audioContext.onError((err) => {
      logTtsDiagnostic('audio_on_error', {
        ...audioState(audioContext),
        errCode: err && err.errCode ? err.errCode : '',
        errMsg: String(err && err.errMsg || err || 'unknown')
      });
      setState({
        pronunciationLoading: false,
        pronunciationPlaying: false
      });
      wx.showToast({
        title: '本地发音暂不可用',
        icon: 'none'
      });
    });

    return audioContext;
  }

  function stop() {
    inflightRequestKey = null;
    if (audioContext) {
      try {
        audioContext.stop();
      } catch (_) {}
    }
    setState({
      pronunciationLoading: false,
      pronunciationPlaying: false
    });
  }

  function reset() {
    lexicalRequestId += 1;
    stop();
    audioText = '';
    setState({
      lexicalInfoLoaded: false,
      lexicalInfoLoading: false,
      phoneticDisplay: '',
      phoneticSource: '',
      pronunciationAvailable: false,
      pronunciationText: '',
      pronunciationLoading: false,
      pronunciationPlaying: false
    });
  }

  async function load(text) {
    const normalizedText = String(text || '').trim();
    lexicalRequestId += 1;
    const requestId = lexicalRequestId;

    stop();
    audioText = normalizedText;

    if (!normalizedText) {
      reset();
      return;
    }

    setState({
      lexicalInfoLoaded: false,
      lexicalInfoLoading: true,
      phoneticDisplay: '',
      phoneticSource: '',
      pronunciationAvailable: false,
      pronunciationText: normalizedText
    });

    try {
      const info = await getLexicalInfo(normalizedText);
      if (requestId !== lexicalRequestId) {
        return;
      }

      var resolved = resolvePhoneticDisplay(info);

      setState({
        lexicalInfoLoaded: true,
        lexicalInfoLoading: false,
        phoneticDisplay: resolved.phoneticDisplay,
        phoneticSource: resolved.phoneticSource,
        pronunciationAvailable: Boolean(info && info.pronunciationAvailable),
        pronunciationText: (info && info.text) || normalizedText
      });
    } catch (_) {
      if (requestId !== lexicalRequestId) {
        return;
      }

      setState({
        lexicalInfoLoaded: true,
        lexicalInfoLoading: false,
        phoneticDisplay: '',
        phoneticSource: '',
        pronunciationAvailable: false,
        pronunciationText: normalizedText
      });
    }
  }

  function playInternal(text, requireAvailable) {
    const targetText = String(text || page.data.pronunciationText || audioText || '').trim();
    logTtsDiagnostic('button_clicked', {
      voice: currentVoice,
      hasText: Boolean(targetText),
      pronunciationAvailable: Boolean(page.data.pronunciationAvailable)
    });
    if (!targetText || (requireAvailable && !page.data.pronunciationAvailable)) {
      wx.showToast({
        title: '本地发音暂不可用',
        icon: 'none'
      });
      return;
    }

    const requestKey = currentVoice + '\u0000' + targetText;

    // Dedupe: this exact text + voice is already downloading — don't fire a duplicate.
    if (page.data.pronunciationLoading && inflightRequestKey === requestKey) {
      return;
    }

    const audio = ensureAudioContext();
    if (page.data.pronunciationPlaying || page.data.pronunciationLoading) {
      try {
        audio.stop();
      } catch (_) {}
    }

    inflightRequestKey = requestKey;
    setState({
      pronunciationLoading: true,
      pronunciationPlaying: false
    });

    downloadPronunciationAudio(targetText, currentVoice)
      .then((tempFilePath) => {
        if (inflightRequestKey !== requestKey) {
          return;
        }
        inflightRequestKey = null;
        logTtsDiagnostic('audio_src_set', {
          tempFilePath,
          src: tempFilePath,
          requestId: getLastTtsRequestId()
        });
        audio.src = tempFilePath;
        logTtsDiagnostic('audio_play_called', audioState(audio));
        audio.play();
      })
      .catch(() => {
        if (inflightRequestKey !== requestKey) {
          return;
        }
        inflightRequestKey = null;
        setState({
          pronunciationLoading: false,
          pronunciationPlaying: false
        });
        wx.showToast({
          title: '本地发音暂不可用',
          icon: 'none'
        });
      });
  }

  function play(text) {
    playInternal(text, true);
  }

  // Play an explicit snapshot (for AI examples) without requiring lexical data.
  function playText(text) {
    playInternal(text, false);
  }

  function getVoice() {
    return currentVoice;
  }

  function setVoice(voice) {
    if (VALID_VOICES.indexOf(voice) < 0) {
      return;
    }
    if (voice === currentVoice) {
      return;
    }
    currentVoice = voice;
    saveStoredVoice(voice);
    setState({ pronunciationVoice: voice });
  }

  function playDiagnosticTestAudio(applyInnerAudioOption) {
    const audio = ensureAudioContext();
    if (applyInnerAudioOption && typeof wx.setInnerAudioOption === 'function') {
      wx.setInnerAudioOption({
        obeyMuteSwitch: false,
        speakerOn: true,
        mixWithOther: true,
        success(res) {
          logTtsDiagnostic('set_inner_audio_option_success', {
            requestId: getLastTtsRequestId(),
            errMsg: String(res && res.errMsg || '')
          });
        },
        fail(err) {
          logTtsDiagnostic('set_inner_audio_option_fail', {
            requestId: getLastTtsRequestId(),
            errMsg: String(err && err.errMsg || err || 'unknown')
          });
        }
      });
    }
    try {
      audio.stop();
    } catch (_) {}
    audio.volume = 1;
    setState({
      pronunciationLoading: true,
      pronunciationPlaying: false
    });
    logTtsDiagnostic('test_mp3_button_clicked', {
      requestId: getLastTtsRequestId(),
      applyInnerAudioOption: Boolean(applyInnerAudioOption)
    });
    downloadDiagnosticTestAudio()
      .then((tempFilePath) => {
        audio.src = tempFilePath;
        logTtsDiagnostic('test_mp3_audio_src_set', audioState(audio));
        logTtsDiagnostic('test_mp3_audio_play_called', audioState(audio));
        audio.play();
      })
      .catch((err) => {
        logTtsDiagnostic('test_mp3_audio_download_failed', {
          requestId: getLastTtsRequestId(),
          errMsg: String(err && err.errMsg || err || 'unknown')
        });
        setState({
          pronunciationLoading: false,
          pronunciationPlaying: false
        });
      });
  }

  function destroy() {
    lexicalRequestId += 1;
    if (audioContext) {
      try {
        audioContext.stop();
      } catch (_) {}
      try {
        audioContext.destroy();
      } catch (_) {}
      audioContext = null;
    }
  }

  return {
    load,
    play,
    playText,
    reset,
    stop,
    destroy,
    getVoice,
    playDiagnosticTestAudio,
    setVoice
  };
}

module.exports = {
  createPronunciationController,
  normalizeDisplayPhonetic,
  buildWordPhoneticsDisplay,
  resolvePhoneticDisplay,
  getStoredVoice,
  saveStoredVoice,
  DEFAULT_VOICE,
  VALID_VOICES
};
