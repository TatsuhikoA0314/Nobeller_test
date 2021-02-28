// model
$(function () {
$('#openModal').click(function(){
    $('#modalArea').fadeIn();
});
$('#closeModal , #modalBg').click(function(){
    $('#modalArea').fadeOut();
});
});

// auto-resize
$(function(){
    $('textarea').autosize();
});

