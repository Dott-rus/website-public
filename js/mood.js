// Mood widget (inspired by dimden).
(function () {
  var MOOD_CACHE_KEY = "dott-mood";
  var MOOD_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

  function getMoodInfo(pleasantness, energy) {
    if (energy >= 0.67) {
      if (pleasantness >= 0.67) {
        return ["Ecstatic", "ffde59", "bigsmile"];
      } else if (pleasantness >= 0.33) {
        return ["Festive", "febd59", "bigsmile"];
      } else if (pleasantness >= 0) {
        return ["Manic", "ff914c", "pacman"];
      } else if (pleasantness >= -0.33) {
        return ["Shocked", "e64f22", "scared"];
      } else if (pleasantness >= -0.67) {
        return ["Angry", "d72121", "anger"];
      } else {
        return ["Enraged", "9b0b00", "anger"];
      }
    } else if (energy >= 0.33) {
      if (pleasantness >= 0.67) {
        return ["Excited", "ffde59", "o"];
      } else if (pleasantness >= 0.33) {
        return ["Motivated", "febd59", "fine"];
      } else if (pleasantness >= 0) {
        return ["Energized", "ff914c", "fine"];
      } else if (pleasantness >= -0.33) {
        return ["Restless", "e64f22", "confused"];
      } else if (pleasantness >= -0.67) {
        return ["Stressed", "d72121", "sad"];
      } else {
        return ["Fuming", "9b0b00", "wa"];
      }
    } else if (energy >= 0) {
      if (pleasantness >= 0.67) {
        return ["Blissful", "ffde59", "o"];
      } else if (pleasantness >= 0.33) {
        return ["Cheerful", "febd59", "smile"];
      } else if (pleasantness >= 0) {
        return ["Pleasant", "ff914c", "fine"];
      } else if (pleasantness >= -0.33) {
        return ["Uneasy", "e64f22", "confused"];
      } else if (pleasantness >= -0.67) {
        return ["Worried", "d72121", "cry"];
      } else {
        return ["Anxious", "9b0b00", "cry"];
      }
    } else if (energy >= -0.33) {
      if (pleasantness >= 0.67) {
        return ["Fulfilled", "6b7a41", "cat"];
      } else if (pleasantness >= 0.33) {
        return ["Content", "a1ad7e", "cute"];
      } else if (pleasantness >= 0) {
        return ["At ease", "c3d098", "fine"];
      } else if (pleasantness >= -0.33) {
        return ["Apathetic", "d1dae6", "neutral"];
      } else if (pleasantness >= -0.67) {
        return ["Down", "89b1cb", "sad"];
      } else {
        return ["Anxious", "688ca9", "cry"];
      }
    } else if (energy >= -0.67) {
      if (pleasantness >= 0.67) {
        return ["Satisfied", "6b7a41", "cat"];
      } else if (pleasantness >= 0.33) {
        return ["Restful", "a1ad7e", "satisfied"];
      } else if (pleasantness >= 0) {
        return ["Relaxed", "c3d098", "sus"];
      } else if (pleasantness >= -0.33) {
        return ["Tired", "d1dae6", "confused"];
      } else if (pleasantness >= -0.67) {
        return ["Sad", "89b1cb", "sad"];
      } else {
        return ["Miserable", "688ca9", "cry"];
      }
    } else {
      if (pleasantness >= 0.67) {
        return ["Serene", "6b7a41", "cat"];
      } else if (pleasantness >= 0.33) {
        return ["Tranquil", "a1ad7e", "satisfied"];
      } else if (pleasantness >= 0) {
        return ["Sleepy", "c3d098", "sus"];
      } else if (pleasantness >= -0.33) {
        return ["Drained", "d1dae6", "sus"];
      } else if (pleasantness >= -0.67) {
        return ["Desolate", "89b1cb", "wa"];
      } else {
        return ["Despair", "688ca9", "cry"];
      }
    }
  }

  var mood = document.getElementById("mood");
  var moodDiv = document.getElementById("mood-div");
  var moodEmoji = document.getElementById("mood-emoji");

  var dimdenGif = document.getElementById("dimdengif");

  if (!mood || !moodDiv || !moodEmoji) {
    return;
  }

  function renderMood(m) {
    if (!m || !Number.isFinite(m.pleasantness) || !Number.isFinite(m.energy)) {
      return false;
    }

    var info = getMoodInfo(m.pleasantness, m.energy);
    var pleasant = (m.pleasantness > 0 ? "+" : "") + m.pleasantness.toFixed(2);
    var energy = (m.energy > 0 ? "+" : "") + m.energy.toFixed(2);

    mood.textContent = pleasant + " / " + energy;
    mood.style.color = "#" + info[1];
    moodEmoji.src = "/img/mood/" + info[2] + ".png";
    moodDiv.title = "Last update: " + new Date(m.timestamp).toLocaleString();

    if (dimdenGif) {
      dimdenGif.src = m.pleasantness < -0.5 && m.energy < 0.33
        ? "/img/mood/aaa.png"
        : "/img/mood/dimden.gif";
    }
    return true;
  }

  function restoreCachedMood() {
    try {
      var cached = JSON.parse(localStorage.getItem(MOOD_CACHE_KEY));
      if (
        !cached
        || !Number.isFinite(cached.savedAt)
        || Date.now() - cached.savedAt > MOOD_CACHE_MAX_AGE
      ) return false;
      return renderMood(cached.value);
    } catch (error) {
      return false;
    }
  }

  function cacheMood(value) {
    try {
      localStorage.setItem(MOOD_CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        value: value,
      }));
    } catch (error) {
      // Rendering the live response does not depend on local storage.
    }
  }

  function updateMood() {
    fetch("https://mood.somedott.space/services/mood/get")
      .then(function (r) {
        return r.json();
      })
      .then(function (m) {
        if (renderMood(m)) cacheMood(m);
      })
      .catch(function () {
        // Keep the last successful reading on screen when the service is down.
      });
  }

  restoreCachedMood();
  updateMood();
  setInterval(updateMood, 1000 * 60);
})();
