function attIs(el, att, type) {
    return type.includes(el[att])
}

let email = Array.from(document.getElementsByTagName('input'))
    .find((el) => getComputedStyle(el).display !== 'none' &&
        getComputedStyle(el).opacity !== '0' &&
        getComputedStyle(el).visibility !== 'hidden' &&
        (attIs(el, 'type', ['email']) ||
            (attIs(el, 'type', ['text']) && (attIs(el, 'name', ['username', 'email'])) || attIs(el, 'autocomplete', ['username', 'email']))
        ));

let password = Array.from(document.getElementsByTagName('input'))
    .find((el) => getComputedStyle(el).display !== 'none' &&
        getComputedStyle(el).opacity !== '0' &&
        getComputedStyle(el).visibility !== 'hidden' &&
        el.type === 'password');

let submit = Array.from(email.closest('form').getElementsByTagName('button'))
    .find((el) => getComputedStyle(el).display !== 'none' &&
        getComputedStyle(el).opacity !== '0' &&
        getComputedStyle(el).visibility !== 'hidden' &&
        el.type === 'submit');

return {email, password, submit}
