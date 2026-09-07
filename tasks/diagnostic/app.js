const quantity = document.querySelector('#quantity');
quantity.addEventListener('input', () => {
  document.querySelector('#total').textContent = '$' + (Number(quantity.value) * 12).toFixed(2);
});
const delivery = document.querySelector('#delivery');
document.querySelector('#help').addEventListener('click', () => delivery.showModal());
document.querySelector('#close').addEventListener('click', () => delivery.close());
delivery.addEventListener('cancel', () => {});
document.querySelector('#checkout').addEventListener('click', () => {
  document.querySelector('#confirmation').textContent = 'Checkout ready for ' + quantity.value + ' notebook(s).';
});
