(function () {
  'use strict';

  /* ============================================================
     Volunteer engagement picker — progressive reveal
     ============================================================ */
  var FOLLOWUP_HINTS = {
    canvass: 'Great — which neighborhood or precinct do you know best?',
    lead: 'Precinct Captains and Parish Coordinators lead a few blocks each — tell us your parish and we’ll follow up about training.',
    rally: 'We’ll text you the exact time and place for the Oct 17–19 stops closest to you.',
    calls: 'Phone banking and texting can be done from home, any evening — let us know what times usually work.',
    unsure: 'No pressure — we’ll keep you posted and you can pick something whenever you’re ready.',
  };

  var engagementInputs = document.querySelectorAll('#volunteer-engagement input[name="primary_interest"]');
  var volunteerReveal = document.getElementById('volunteer-reveal');
  var followupHint = document.getElementById('volunteer-followup-hint');

  engagementInputs.forEach(function (input) {
    input.addEventListener('change', function () {
      if (!volunteerReveal) return;
      volunteerReveal.classList.add('is-open');
      var branch = input.getAttribute('data-branch');
      if (followupHint) followupHint.textContent = FOLLOWUP_HINTS[branch] || '';

      // Once a branch is picked, the contact fields inside the panel become required.
      volunteerReveal.querySelectorAll('input[name], select[name]').forEach(function (el) {
        if (el.name === 'followup_answers') return;
        el.required = true;
      });
    });
  });

  /* ============================================================
     Photo upload (We Can Do This) — preview + remove
     ============================================================ */
  var photoInput = document.getElementById('wcdt-photo');
  var photoPreview = document.getElementById('wcdt-photo-preview');
  var photoPreviewImg = document.getElementById('wcdt-photo-preview-img');
  var photoRemoveBtn = document.getElementById('wcdt-photo-remove');
  var photoDataUrl = null;

  if (photoInput) {
    photoInput.addEventListener('change', function () {
      var file = photoInput.files && photoInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        photoDataUrl = e.target.result;
        if (photoPreviewImg) photoPreviewImg.src = photoDataUrl;
        if (photoPreview) photoPreview.classList.add('is-visible');
      };
      reader.readAsDataURL(file);
    });
  }
  if (photoRemoveBtn) {
    photoRemoveBtn.addEventListener('click', function () {
      photoDataUrl = null;
      if (photoInput) photoInput.value = '';
      if (photoPreview) photoPreview.classList.remove('is-visible');
    });
  }

  /* ============================================================
     Generic form submit handler for every .giv-form
     ============================================================ */
  function getSource() {
    var params = new URLSearchParams(window.location.search);
    return params.get('src') || document.referrer || 'direct';
  }

  function validate(form) {
    var valid = true;

    // Radio-button groups (engagement picker, recognition preference, etc.) aren't
    // wrapped in `.field`, so they get their own check: if the group exists, exactly
    // one option must be checked before the form can submit.
    var radioGroups = {};
    form.querySelectorAll('input[type="radio"][name]').forEach(function (radio) {
      radioGroups[radio.name] = radioGroups[radio.name] || [];
      radioGroups[radio.name].push(radio);
    });
    Object.keys(radioGroups).forEach(function (name) {
      var group = radioGroups[name];
      var groupWrap = group[0].closest('.interest-group');
      if (!groupWrap) return;
      var panel = groupWrap.closest('.reveal-panel');
      if (panel && !panel.classList.contains('is-open')) return;
      var anyChecked = group.some(function (r) {
        return r.checked;
      });
      groupWrap.classList.toggle('has-error', !anyChecked);
      if (!anyChecked) valid = false;
    });

    var fields = form.querySelectorAll('.field');
    fields.forEach(function (field) {
      var input = field.querySelector('input[required], textarea[required]');
      if (!input) {
        field.classList.remove('has-error');
        return;
      }
      // Skip validation for fields inside a not-yet-opened reveal panel.
      var panel = field.closest('.reveal-panel');
      if (panel && !panel.classList.contains('is-open')) {
        field.classList.remove('has-error');
        return;
      }
      var ok = input.type === 'checkbox' ? true : input.checkValidity();
      field.classList.toggle('has-error', !ok);
      if (!ok) valid = false;
    });
    return valid;
  }

  function formToPayload(form) {
    var data = {};
    var formData = new FormData(form);
    formData.forEach(function (value, key) {
      if (data[key] !== undefined) return; // radios/first value wins
      data[key] = typeof value === 'string' ? value.trim() : value;
    });
    // Checkboxes that were left unchecked never appear in FormData — normalize to false/"no".
    form.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      if (!(cb.name in data)) data[cb.name] = 'no';
      else data[cb.name] = 'yes';
    });
    data.source = getSource();
    if (form.id === 'wcdt-form' && photoDataUrl) {
      data.photo_data_url = photoDataUrl;
    }
    return data;
  }

  document.querySelectorAll('.giv-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errorBox = form.querySelector('.field-submit-error');
      if (errorBox) errorBox.classList.remove('is-visible');

      if (!validate(form)) return;

      var action = form.getAttribute('data-action');
      var submitBtn = form.querySelector('button[type="submit"]');
      var originalLabel = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';
      }

      fetch('/api/get-involved/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToPayload(form)),
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Request failed');
          return res.json().catch(function () { return {}; });
        })
        .then(function () {
          if (typeof window.trackEvent === 'function') {
            window.trackEvent('get_involved_submit', { label: action });
          }
          var card = form.closest('.form-card');
          var success = card ? card.querySelector('.form-success') : null;
          form.classList.add('is-submitted');
          form.style.display = 'none';
          if (success) success.classList.add('is-visible');
        })
        .catch(function () {
          if (errorBox) errorBox.classList.add('is-visible');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalLabel;
          }
        });
    });
  });

  /* ============================================================
     Spread the Word — copy link / share via text
     ============================================================ */
  var shareNote = document.getElementById('giv-share-note');
  var pageUrl = 'https://patmooreforcongress.com/get-involved.html';
  var shareMessage =
    'Everywhere I go, people keep telling me — we can do this. Join me: ' + pageUrl;

  var copyBtn = document.getElementById('giv-share-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (navigator.clipboard) {
        navigator.clipboard
          .writeText(pageUrl)
          .then(function () {
            if (shareNote) shareNote.textContent = 'Link copied!';
          })
          .catch(function () {
            if (shareNote) shareNote.textContent = pageUrl;
          });
      } else if (shareNote) {
        shareNote.textContent = pageUrl;
      }
    });
  }

  var textBtn = document.getElementById('giv-share-text');
  if (textBtn) {
    textBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (navigator.share) {
        navigator
          .share({ title: 'Pat Moore for Congress', text: shareMessage, url: pageUrl })
          .catch(function () {});
      } else {
        window.location.href = 'sms:?&body=' + encodeURIComponent(shareMessage);
      }
    });
  }
})();
