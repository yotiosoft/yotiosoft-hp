document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  const error = document.getElementById('contact-form-error');
  const button = form.querySelector('[type="submit"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    button.disabled = true;

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
      });
      if (!response.ok) throw new Error('送信できませんでした。入力内容を確認して、もう一度お試しください。');
      window.location.assign('/support/thanks.html');
    } catch (cause) {
      error.textContent = cause.message || '通信エラーが発生しました。時間をおいて再度お試しください。';
      error.hidden = false;
      if (window.turnstile) window.turnstile.reset();
      button.disabled = false;
    }
  });
});
