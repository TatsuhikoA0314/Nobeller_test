const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const app = express();
// if deployed on AWS it will use that port
const {PORT = 3000} = process.env;
const mysql = require('mysql');
const trans = require('./public/js/translate.js');
const AWS = require("aws-sdk");
AWS.config.update({region: "ap-northeast-1"});

require('date-utils');

const connection = mysql.createConnection({
  multipleStatements: true,
  // DB info
});

connection.connect(function(err) {
  if (err) {
    console.error('Database connection failed: ' + err.stack);
    return;
  }
  console.log('Connected to database.');
});

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.use(
  session({
    secret: 'my_secret_key',
    resave: false,
    saveUninitialized: false,
  })
)
app.use(express.static('public'));
app.use(express.urlencoded({extended: false}));
// check login
app.use((req,res,next)=>{
  if (req.session.userId === undefined) {
    res.locals.username = 'Guest';
    res.locals.isLoggedIn = false;
  } else {
    res.locals.userId =  req.session.userId;
    res.locals.username =  eq.session.username;
    res.locals.isLoggedIn = true;
  }
  next();
});


/*
========================================
    create_post
=========================================
*/
// create a new page
app.post('/create', (req, res) => {
  try {
    const sql_error = 'SELECT * FROM series WHERE author_id = ?';
    const sql_exist = 'SELECT * FROM series WHERE author_id = ? AND title = ?';
    const sql_insert = 'INSERT INTO pages (series_id,subtitle,contents,date,origin) VALUES (?, ?, ?, ?, ?)';
    const sql = 'SELECT * FROM users WHERE user_id = ?';
    const sql_update = 'UPDATE series SET date = date, lastUpdate = ?  WHERE series_id = ?';
    const sql_new = 'INSERT INTO series (author_id,title,author_name,discription,genre,likes,date,viewed,lastUpdate,lang,origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    
    const author_id = res.locals.userId;
    const title = req.body.title;
    const subtitle = req.body.subtitle;
    const discription = req.body.discription;
    const contents = req.body.contents.replace(/\r?\n/g, '<br>');
    const category = req.body.category;
    const likes = 1;
    const viewed = 1;
    const lang = req.body.lang;
    const translate_lang = req.body.translate;
    const dateNow = new Date();
    const date = dateNow.toFormat("YYYY-MM-DD HH24-MI-SS");
    const errors=[];
    var origin = "0";
    var author_name;
    var series_id;
    var genre;

    if(Array.isArray(category)){
      genre = category.join();
    }else{
      genre = category;
    }
  // check everything is filled
    if (author_id === '') {errors.push('ログインができていません');}            
    if (title === '') {errors.push('作品名が空です');}      
    if (subtitle === '') {errors.push('サブタイトルが空です');}         
    if (discription === '') {errors.push('紹介文が空です');}          
    if (category === undefined) {errors.push('ジャンルが選択されていません');} 
    if (contents === '') {errors.push('本文が空です');} 
    if (lang == translate_lang) {errors.push('使用言語と翻訳言語は変えてください');} 

    // if lack something
    if (errors.length > 0) {
      connection.query(sql_error,author_id, (error, results)=>{
        return res.render('./main/post.ejs', {posts: results, errors: errors});
      });
    }else{
      connection.query(sql_exist,[author_id,title], (error, results)=>{
        // if title exist add to the same title
        if(results.length != 0){
          series_id = results[0].series_id;
          connection.query(sql_insert,[series_id,subtitle,contents,date,origin], (error, results)=>{
            origin = results.insertId;
            connection.query(sql_update,[date,series_id]);
          });
        }else{
          // create a new series
          connection.query(sql,author_id, (error, results)=>{
            author_name = results[0].name;
            connection.query(sql_new,[author_id,title,author_name,discription,genre, likes,date,viewed,date,lang,origin], (error, results)=>{
              series_id = results.insertId;
              connection.query(sql_insert,[series_id,subtitle,contents,date,origin], (error, results)=>{
                console.log(results);
                origin = results.insertId;
              });
            });
          });
        }
      });
    }
    // 
    // translate
    // 
    if(translate_lang == "none"){
      return res.redirect('myPosts');
    }else{
      var original = {
        SourceLanguageCode: lang,
        TargetLanguageCode: translate_lang,
        Text: ''
      };
      async function translate() {
        console.log('calling');
        var translated = [];
        original.Text =  title;
        translated.push(await trans.test(original));
        original.Text =  subtitle;
        translated.push(await trans.test(original));
        original.Text =  contents;
        translated.push(await trans.test(original));
        original.Text =  discription;
        translated.push(await trans.test(original));
        original.Text =  discription;
        translated.push(await trans.test(original));
        return translated;
      }

      Promise.all([translate()]).then(results => {
        result = results[0];
        const translated_title = result[0];
        const translated_subtitle = result[1];
        const translated_contents = result[2];
        const translated_discription = result[3];

        connection.query(sql_exist,[author_id,translated_title], (error, results)=>{
          // if title exist add
          if(results.length != 0){
            series_id = results[0].series_id;
            connection.query(sql_insert,[series_id,translated_subtitle,translated_contents,date,origin], (error, results)=>{
              connection.query(sql_update,[date,series_id]);
              return res.redirect('myPosts');
            });
          }else{
            // create a new series
            connection.query(sql,author_id, (error, results)=>{
              author_name = results[0].name;
              connection.query(sql_new,[author_id,translated_title,author_name,translated_discription,genre, likes,date,viewed,date,translate_lang,origin], (error, results)=>{
                series_id = results.insertId;
                connection.query(sql_insert,[series_id,translated_subtitle,translated_contents,date,origin], (error, results)=>{
                  return res.redirect('myPosts');
                });
              });
            });
          }
        });
      });
    }
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});

/*
========================================
    MAIN
=========================================
*/
// main page
app.get('/', (req, res) => { 
  try {
    // search DB for each list
    const sql_notice = 'SELECT * FROM notification;';
    const sql_rec = 'SELECT * FROM series WHERE date >= (NOW() - INTERVAL 7 DAY) ORDER BY likes DESC;';
    const sql_new = 'SELECT * FROM series WHERE date >= (NOW() - INTERVAL 31 DAY) ORDER BY likes DESC;';
    const sql_popular = 'SELECT * FROM series ORDER BY likes DESC';
    const sql = sql_notice+sql_rec+sql_new+sql_popular;

    connection.query(sql, (error, results)=>{
      res.render('index.ejs', {notice: results[0], ranking_list: results[1], new_list: results[2], popular_list: results[3]});
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/error');
  }
});
// page for dafault search
app.get('/search', (req, res) => {
  try {
    // default search
    const sql = 'SELECT * FROM series ORDER BY date DESC LIMIT 100';

    connection.query(sql, (error, results)=>{
      res.render('./main/search.ejs', {series: results});
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// page for post
app.get('/post', (req, res) => {
  try {
    // check login
    if(res.locals.username == 'Guest'){
      // if not go login
      res.redirect('/login');
    }else{
      // go to post page
      const sql = 'SELECT * FROM series WHERE author_id = ?';
      const user_id = res.locals.userId;
      const errors=[];

      connection.query(sql,user_id, (error, results)=>{
        res.render('./main/post.ejs', {posts: results, errors: errors});
      });
    } 
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }  
});
// page for series
app.get('/contents', (req, res) => {
  try {
    // search seires
    const sql_views = 'SELECT * FROM series JOIN pages ON series.series_id = pages.series_id WHERE series.series_id = ?';
    const sql = 'SELECT * FROM users WHERE users.user_id = ?';
    const series_id = req.query.series_id;
    const user_id = res.locals.userId;
    // if is_marked = true the viewer press the heart and liked it before
    var is_marked = false;

    connection.query(sql_views,series_id, (error, results)=>{
      // if veiwer is not author veiw+1
      if(user_id != results[0].author_id){
        connection.query('UPDATE series SET viewed = viewed+1, date = date WHERE series_id = ?',[series_id]);
      }
      // check if the viewer liked the series
      connection.query(sql,user_id, (error, results_m)=>{
        // if not login skip
        if(res.locals.username == 'Guest'){
          
        }else{
          // check like list (string numbers with ',')
          var marked = results_m[0].marked;
          // if list is null or empty do nothing
          if(marked == null || marked == ""){

          }else{
            // if the only like is this series
            if(marked == series_id){
              is_marked = true;
            }else{
              // if there is multiple likes
              var marked_arr = marked.split(',');
              // split the string and check if the list has the series
              for(let i=0; i<marked_arr.length; i++){
                if(marked_arr[i] == series_id){
                  is_marked = true;
                  break;
        }}}}    }
        return res.render('./main/contents.ejs', {contents: results, marking: is_marked});
    });
  });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// page for page
app.get('/page', (req, res) => {
  try {
    // search the page
    const sql_isLast = 'SELECT * FROM series JOIN pages ON series.series_id = pages.series_id WHERE pages.series_id = ?';
    const sql = 'SELECT * FROM series JOIN pages ON series.series_id = pages.series_id WHERE pages.contents_id = ?';
    const contents_id = req.query.contents_id;
    const series_id = req.query.series_id;
    // if isLast = true "次へ"　will disappear
    var isLast = false;

    connection.query(sql_isLast,series_id, (error, results)=>{
      // check if the page is the last page in series
      if (results.slice(-1)[0].contents_id==contents_id) {
        isLast = true;
      } else{}
      // make it connectable from .ejs
      res.locals.isLast = isLast; 
    });

    connection.query(sql,contents_id, (error, results)=>{
      res.render('./main/page.ejs', {page: results[0]}); 
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// if viewer press "次へ" this will search the next page
app.get('/next', (req, res) => {
  try {
    const sql_isLast = 'SELECT * FROM series JOIN pages ON series.series_id = pages.series_id WHERE pages.series_id = ?';
    const contents_id = req.query.contents_id;
    const series_id = req.query.series_id;
    var isLast = false;

    connection.query(sql_isLast,series_id, (error, results)=>{
      // loop to find where the page is in the array
      for (let i = 0; i < results.length; i++) {
        // check if the page is the last page in series
        if(results[i].contents_id==contents_id){
          return_results=results[i+1];
          // if next page is last hide "次へ"
          if (results.slice(-1)[0].contents_id==return_results.contents_id) {
            isLast = true;
          } else {
            isLast = false;
          }
          // make it connectable from .ejs
          res.locals.isLast = isLast; 
          res.render('./main/page.ejs', {page: return_results}); 
        }
      }
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// page for author page
app.get('/author', (req, res) => {
  try {
    // search seires from author_id
    const sql = 'SELECT * FROM series WHERE series.author_id = ?';
    const author_id = req.query.author_id;

    connection.query(sql,author_id, (error, results)=>{
      res.render('./main/author.ejs', {author: results});
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// not working just view
app.get('/contact', (req, res) => {
  res.render('./main/contact.ejs');
});

/*
========================================
    USER_PAGE
=========================================
*/
// see my posts
app.get('/myPosts', (req, res) => {
  try {
    // search from author id
    const sql = 'SELECT * FROM series WHERE series.author_id = ?';
    const user_id = res.locals.userId;

    connection.query(sql,user_id, (error, results)=>{
      return res.render('./user_page/myPosts.ejs', {myPosts: results});
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// see my series
app.get('/my_contents', (req, res) => {
  try {
    // serach from series_id
    const sql = 'SELECT * FROM series JOIN pages ON series.series_id = pages.series_id WHERE series.series_id = ?';
    const series_id = req.query.series_id;

    connection.query(sql,series_id, (error, results)=>{
      res.render('./user_page/my_contents.ejs', {my_contents: results});
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// see my page
app.get('/my_page', (req, res) => {
  try {
    const sql_isLast = 'SELECT * FROM series JOIN pages ON series.series_id = pages.series_id WHERE pages.series_id = ?';
    const sql = 'SELECT * FROM series JOIN pages ON series.series_id = pages.series_id WHERE pages.contents_id = ?';
    const series_id = req.query.series_id;
    const contents_id = req.query.contents_id;
    var isLast = false;

    // check if the page is last in series
    connection.query(sql_isLast,series_id, (error, results)=>{
      if (results.slice(-1)[0].contents_id==contents_id) {
        isLast = true;
      } else{}
      res.locals.isLast = isLast; 
      });
      connection.query(sql,contents_id, (error, results)=>{
      res.render('./user_page/my_page.ejs', {my_page: results[0]});
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// see my likes
app.get('/myLikes', (req, res) => {
  try {
    const sql = 'SELECT * FROM users WHERE users.user_id = ?';
    const sql_searchLikes = 'SELECT * FROM series WHERE series_id = ?';
    const user_id = res.locals.userId;
    var Liked_arr = [];

    connection.query(sql,user_id, (error, results)=>{
      // if marked is null or empty 
      if(results[0].marked === null){
        res.render('./user_page/myLikes.ejs', {Liked: Liked_arr});
      }else{
        var marked = results[0].marked ;
        var marked_arr = marked.split(',');
            
        if(marked_arr.length > 0){
          for(let i=0; i < marked_arr.length; i++){
            connection.query(sql_searchLikes,[marked_arr[i]], (error, Likes)=>{
              Liked_arr = Liked_arr.concat(Likes);
              
              if(i+1 == marked_arr.length){
                res.render('./user_page/myLikes.ejs', {Liked: Liked_arr});
              }
            });
          }
        }
      }
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }  
});
// if viewer in my page press "次へ" this will search the next page
app.get('/edit_next', (req, res) => {
  try {
    const sql_isLast = 'SELECT * FROM series JOIN pages ON series.series_id = pages.series_id WHERE pages.series_id = ?';
    const contents_id = req.query.contents_id;
    const series_id = req.query.series_id;
    var isLast = false;

    connection.query(sql_isLast,series_id, (error, results)=>{
      for (let i = 0; i < results.length; i++) {
        if(results[i].contents_id==contents_id){
          return_results=results[i+1];
          if (results.slice(-1)[0].contents_id==return_results.contents_id) {
            isLast = true;
          } else {
            isLast = false;
          }
          res.locals.isLast = isLast; 
          res.render('./user_page/my_page.ejs', {my_page: return_results}); 
        }
      }
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// go to delet account page
app.get('/deleteAccount', (req, res) => {
  var error = 0;
  res.render('./user_page/deleteAccount.ejs', {errors: error});
});
// go to deleted page
app.get('/deleted', (req, res) => {
  res.render('./edit_page/deleted.ejs');
});
// delet account
app.post('/deleteMyAccount', (req, res) => {
  try {
    const sql = 'SELECT * FROM users WHERE user_id = ?';
    const del_account = 'DELETE FROM users WHERE user_id = ?';
    const user_id = res.locals.userId;
    var error = 0;

    connection.query(sql, user_id, (error, results)=>{
      if (results.length > 0) {
        const plain = req.body.password;
        const hash = results[0].password;
        // check password is correct
        bcrypt.compare(plain, hash, (errors, isEqual) => {
          // if correct delete account
          if (isEqual) {
            connection.query(del_account, user_id, (error, results)=>{
              req.session.userId = undefined
              return res.redirect('/deleted');
            });            
          } else {
            // if not return with error
            error = 1;
            return res.render('./user_page/deleteAccount.ejs',{errors: error});
          }
        });
      } else {
        returnres.redirect('/error');
      }
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});




/*
========================================
    EDIT_PAGE
=========================================
*/
// go to edit_series page
app.get('/edit_series', (req, res) => {
  try {
    const sql = 'SELECT * FROM series WHERE series.series_id = ?';
    const series_id = req.query.series_id;
    const errors=[];

    connection.query(sql,series_id, (error, results)=>{
      res.render('./edit_page/edit_series.ejs', {edit_series: results, errors: errors});
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// update the seires info
app.post('/Update_series', (req, res) => {
  try {
    const sql = 'SELECT * FROM series WHERE author_id = ?';
    const sql_update = 'UPDATE series SET title = ?, discription = ?, genre = ?, date = date, lastUpdate = lastUpdate WHERE series_id = ?';
    const title = req.body.title;
    const user_id = res.locals.userId;
    const series_id = req.query.series_id;
    const discription = req.body.discription;
    const category = req.body.category;
    var genre;
    const errors=[];

    if(Array.isArray(category)){
      genre = category.join();
    }else{
      genre = category;
    }
    // check everything is filled
    if (title === '') {errors.push('作品名が空です');}        
    if (discription === '') {errors.push('紹介文が空です');}          
    if (category === undefined) {errors.push('ジャンルが選択されていません');} 
    // if not return with error
    if (errors.length > 0) {
      connection.query(sql,user_id, (error, results)=>{
        res.render('./edit_page/edit_series.ejs', {edit_series: results, errors: errors});
      });
    }else{
      connection.query(sql_update,[title,discription,genre,series_id],(error, results)=>{
        res.redirect('/myPosts');
      });
    }
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// go to add_page page
app.get('/add_page', (req, res) => {
  try {
    const sql = 'SELECT * FROM series WHERE series_id = ?';
    const series_id = req.query.series_id;
    const errors=[];

    connection.query(sql,series_id, (error, results)=>{
      res.render('./edit_page/add_page.ejs', {add_page: results[0], errors: errors});
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// create new page in exiting seires
app.post('/new_page', (req, res) => {
  try {
    const sql = 'SELECT * FROM series WHERE series_id = ?';
    const sql_insert = 'INSERT INTO pages (series_id,subtitle,contents,date) VALUES (?, ?, ?, ?)';
    const sql_update = 'UPDATE series SET date = date, lastUpdate = ?  WHERE series_id = ?';
    const subtitle = req.body.subtitle;
    const series_id = req.query.series_id;
    const contents = req.body.contents.replace(/\r?\n/g, '<br>');;
    const dateNow = new Date();
    const date = dateNow.toFormat("YYYY-MM-DD HH24-MI-SS");
    const errors=[];

    if (subtitle === '') {errors.push('サブタイトルが空です');}        
    if (contents === '') {errors.push('本文が空です');}          
  
    if (errors.length > 0) {
      connection.query(sql,series_id, (error, results)=>{
        res.render('./edit_page/add_page.ejs', {add_page: results[0], errors: errors});
      });
    }else{
      connection.query(sql_insert,[series_id,subtitle,contents,date], (error, results)=>{
        connection.query(sql_update,[date,series_id]);
        res.redirect('/myPosts');
      });
    }
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// go to edit_page page
app.get('/edit_page', (req, res) => {
  try {
    const sql = 'SELECT * FROM pages WHERE contents_id = ?';
    const contents_id = req.query.contents_id;
    const errors=[];

    connection.query(sql,contents_id, (error, results)=>{
      res.render('./edit_page/edit_page.ejs', {edit_page: results[0], errors: errors});
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// update the page info
app.post('/Update_page', (req, res) => {
  try {
    const sql = 'SELECT * FROM pages WHERE contents_id = ?';
    const sql_update = 'UPDATE pages SET subtitle = ?, contents = ?, date = date WHERE contents_id = ?';
    const subtitle = req.body.subtitle;
    const contents_id = req.query.contents_id;
    const contents = req.body.contents.replace(/\r?\n/g, '<br>');;
    const errors=[];

    if (subtitle === '') {errors.push('サブタイトルが空です');}        
    if (contents === '') {errors.push('本文が空です');}          

    if (errors.length > 0) {
      connection.query(sql,series_id, (error, results)=>{
        res.render('./edit_page/edit_page.ejs', {edit_page: results, errors: errors});
      });
    }else{
      connection.query(sql_update,[subtitle,contents,contents_id], (error, results)=>{
        res.redirect('/myPosts');
      });
    }
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// if the page is translated and viewer wants to translate it
app.get('/viewer_edit', (req, res) => {
  try {
    const sql = 'SELECT * FROM pages WHERE contents_id = ?';
    const contents_id = req.query.contents_id;
    const errors = [];

    connection.query(sql,contents_id, (error, results)=>{
      connection.query(sql,results[0].origin, (error, original)=>{
        res.render('./edit_page/viewer_edit.ejs', {edit_page: results[0], original: original[0], errors:errors});
      });
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
//update the translated page by viewer
app.post('/Update_viewer', (req, res) => {
  try {
    const sql = 'SELECT * FROM pages WHERE contents_id = ?';
    const sql_update = 'UPDATE pages SET subtitle = ?, contents = ?, date = date WHERE contents_id = ?';
    const subtitle = req.body.subtitle;
    const contents_id = req.query.contents_id;
    const contents = req.body.contents.replace(/\r?\n/g, '<br>');;
    const errors=[];

    if (subtitle === '') {errors.push('サブタイトルが空です');}        
    if (contents === '') {errors.push('本文が空です');}          

    if (errors.length > 0) {
      connection.query(sql,series_id, (error, results)=>{
        res.render('./edit_page/edit_page.ejs', {edit_page: results, errors: errors});
      });
    }else{
      connection.query(sql_update,[subtitle,contents,contents_id], (error, results)=>{
        res.redirect('/');
      });
    }
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
/*
========================================
    DELETE_POST
=========================================
*/
// delete series
app.get('/delete_series', (req, res) => {
  try {
    const sql = 'SELECT * FROM series WHERE series_id = ?';
    const series_id = req.query.series_id;

    connection.query(sql,series_id, (error, results)=>{
      // if the post is already deleted
      if (results == null||results == "") {
        res.redirect('/myPosts');
      }else{
        connection.query('DELETE FROM series WHERE series_id = ?',[series_id]);
        res.redirect('/myPosts');
      }
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }  
});
// delet page
app.get('/delete_page', (req, res) => {
  try {
    const sql_exist = 'SELECT * FROM pages WHERE contents_id = ?';
    const sql_isLast = 'SELECT * FROM pages WHERE series_id = ?';
    const sql_del_series = 'DELETE FROM series WHERE series_id = ?';
    const sql_del_page = 'DELETE FROM pages WHERE contents_id = ?';
    const series_id = req.query.series_id;
    const contents_id = req.query.contents_id;

    connection.query(sql_exist,contents_id, (error, results)=>{
      // if the page is already deleted
      if (results == null||results == "") {
        return res.redirect('/myPosts');
      }else{
        connection.query(sql_isLast,series_id, (error, results)=>{
          // if the page is the last in series delete series
          if(results.length == 1){
            connection.query(sql_del_series,series_id);
            return res.redirect('/myPosts');
          }else{
            connection.query(sql_del_page,contents_id);
            return res.redirect('/myPosts');
          }
        });
      }
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});

/*
========================================
    Likes
=========================================
*/
// add series id in marking list
app.get('/marking_add', (req, res) => {
  try {
    const sql_addLike = 'UPDATE series SET likes = likes +1, date = date WHERE series_id = ?';
    const sql_isMarked = 'SELECT * FROM users WHERE users.user_id = ?';
    const sql_upMarked = 'UPDATE users SET marked = ? WHERE user_id = ?';
    const series_id = req.query.series_id;
    const user_id = res.locals.userId;

    connection.query(sql_isMarked,user_id, (error, results)=>{
      // if marked is empty
      if(results[0].marked === null||results[0].marked == ""){
        marked = series_id;
      }else{
        var marked = results[0].marked;
        var marked_arr = marked.split(',');

        for(let i=0; i < marked_arr.length; i++){
          if(marked_arr[i] == series_id){
            return res.redirect('/myLikes');
          }
        }
        marked = results[0].marked + ","+series_id;
      }
      // add +1 on series.likes
      connection.query(sql_addLike,series_id);
      // update marked
      connection.query(sql_upMarked,[marked,user_id]);
      return res.redirect('/myLikes');
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }    
});
// remove series id in marking list
app.get('/marking_remove', (req, res) => {
  try {
    const sql_removeLike = 'UPDATE series SET likes = likes -1, date = date WHERE series_id = ?';
    const sql_isMarked = 'SELECT * FROM users WHERE users.user_id = ?';
    const sql_upMarked = 'UPDATE users SET marked = ? WHERE user_id = ?';
    const series_id = req.query.series_id;
    const user_id = res.locals.userId;

    connection.query(sql_isMarked,user_id, (error, results)=>{
      var marked = results[0].marked;
      var marked_arr = marked.split(',');

      for(let i=0; i < marked_arr.length; i++){
        if(marked_arr[i] == series_id){
          if(marked_arr.length == 1){
            marked = "";
          }else{
            marked_arr.splice(i, i);
            marked = marked_arr.join(',');
          }
          // -1 on series.likes
          connection.query(sql_removeLike,series_id);
          // update marked
          connection.query(sql_upMarked,[marked,user_id]);
          return res.redirect('/myLikes');
        }
      }
      return res.redirect('/');
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }    
});


/*
========================================
    login-out
=========================================
*/
// go to login page
app.get('/login', (req, res) => {
  res.render('./login_out/login.ejs');
});
// go to sign up page
app.get('/signup', (req, res) => {
  res.render('./login_out/signup.ejs', { errors: [] });
});
// delete session
app.get('/logout', (req, res) => {
  req.session.destroy((error)=>{
      res.redirect('/');
  });
});
// login
app.post('/login', (req, res) => {
  try {
    const sql = 'SELECT * FROM users WHERE email = ?';
    const email = req.body.email;

    connection.query(sql,email, (error, results)=>{
      if (results.length > 0) {
        const plain = req.body.password;
        const hash = results[0].password;
        // check the apssword is correct
        bcrypt.compare(plain, hash, (error, isEqual) => {
          if (isEqual) {
            req.session.userId = results[0].user_id;
            req.session.username = results[0].name;
            res.redirect('/');
          } else {   
              res.redirect('/login');
          }
        });
      } else {
        res.redirect('/login');
      }
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// sign up (await)
app.post('/signup', (req, res, next) => {
  const username = req.body.username;            
  const email = req.body.email;            
  const password = req.body.password;                    
  const errors = [];            
  // check evrything is filled 
  if (username === '') {errors.push('ユーザー名が空です');}            
  if (email === '') {errors.push('メールアドレスが空です');}            
  if (password === '') {errors.push('パスワードが空です');}                       
  // if there is an error  
  if (errors.length > 0) {            
      res.render('./login_out/signup.ejs', { errors: errors });             
  } else {
      // go next 
      next();            
  }            
},(req, res, next) => {
  const sql_name = 'SELECT * FROM users WHERE name = ?';
  const sql_email = 'SELECT * FROM users WHERE email = ?';
  const username = req.body.username;                   
  const email = req.body.email;                   
  const errors = [];
  check();

  async function check() {
    await new Promise((resolve)=>{
      setTimeout(()=>{
        // user名重複確認
        connection.query(sql_name,username, (error, results)=>{
          if(results.length > 0){
            console.log("0",results.length);       
            errors.push('ユーザー名が重複しています');             
          }
        });
        resolve();
      },500);
    });

    await new Promise((resolve)=>{
      setTimeout(()=>{
        // メアド重複確認
        connection.query(sql_email,email, (error, results)=>{
          if(results.length > 0){    
            console.log("1",results.length);               
            errors.push('メールアドレスが重複しています');                       
          }
        });
        resolve();
      },500);
    });

    await new Promise((resolve)=>{
      setTimeout(()=>{
        // メアド重複確認
        if(errors.length > 0){
          res.render('./login_out/signup.ejs', { errors: errors });          
        }else{                   
          next();                           
        }   
        resolve();
      },500);
    });
  }
},(req, res) => {
  const insert = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)'; ; 
  const username = req.body.username;
  const email = req.body.email;
  const password = req.body.password;
  // hash the pasword 
  bcrypt.hash(password, 10, (error, hash) => {
    connection.query(insert,[username, email, hash], (error, results)=>{
      // login with the new user
      req.session.userId = results.insertId;
      req.session.username = username;
      res.redirect('/');
    });
  });
});

/*
========================================
    search
=========================================
*/
// search series with entered keyword
app.post('/keyword_search', (req, res) => {
  try {
    const keyword = '%'+req.body.keyword+'%';
    const sql = 'SELECT * FROM series WHERE CONCAT(title, author_name, discription, genre) like ? LIMIT 100';
  
    connection.query(sql, keyword, (error, results)=>{
      res.render('./main/search.ejs', {series: results});
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// search series with entered detail
app.post('/details_search', (req, res) => {
  try {
    var sql = 'SELECT * FROM series WHERE title like ? AND author_name like ? AND genre like ? AND lang like ?';
    const title = '%'+req.body.title+'%';
    const author_name = '%'+req.body.author_name+'%';
    const lang = req.body.lang;
    const terms = req.body.term;
    const sort_list = req.body.sort_list;
    var genre = req.body.category;
    var term = '0';

    if(genre===undefined){
      genre="%";
    }
    // search from when
    if(terms==="week"){
      term=' AND date >= (NOW() - INTERVAL 7 DAY)'
      console.log(terms);
    }else if(terms==="month"){
      term=' AND date >= (NOW() - INTERVAL 1 MONTH)';
    }else if(terms==="6month"){
      term=' AND date >= (NOW() - INTERVAL 6 MONTH)';
    }else if(terms==="year"){
      term=' AND date >= (NOW() - INTERVAL 12 MONTH)';
    }else{
      term=' AND date >= 0';
    }
    // sort
    if(sort_list==="popular"){
      sort=' ORDER BY likes DESC  LIMIT 100'
    }else if(sort_list==="new"){
      sort=' ORDER BY date DESC  LIMIT 100';
    }else if(sort_list==="update"){
      sort=' ORDER BY lastUpdate DESC  LIMIT 100';
    }else if(sort_list==="rising"){
      sort=' AND date >= (NOW() - INTERVAL 7 DAY) ORDER BY likes DESC LIMIT 100';
    }else{
      sort=' ORDER BY date DESC  LIMIT 100';
    }
    console.log(sql+term+sort,[title,author_name,genre,lang]);
    connection.query(sql+term+sort,[title,author_name,genre,lang], (error, results)=>{
      res.render('./main/search.ejs', {series: results});  
    });

  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  } 
});
// search series from main page list
app.get('/more_search', (req, res) => {
  try {
    const more = req.query.more;
    var sql;
    // search depending on which list it is from
    if(more === "ranking"){
       sql = 'SELECT * FROM series WHERE date >= (NOW() - INTERVAL 7 DAY) ORDER BY likes DESC;';
    }else if(more === "new"){
       sql = 'SELECT * FROM series WHERE date >= (NOW() - INTERVAL 31 DAY) ORDER BY likes DESC;';
    }else if(more === "recomend"){
       sql = 'SELECT * FROM series ORDER BY likes DESC';
    }else{
      res.redirect('/error');
    }
    
    
    

    // console.log(more);
    // res.redirect('/');
  
    connection.query(sql, (error, results)=>{
      res.render('./main/search.ejs', {series: results});
    });
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});
// search series with entered keyword
app.get('/search-paging', (req, res) => {
  try {
    const series = req.body.series;
    res.render('./main/search.ejs', {series: series});
  }catch(e) {
    console.log("error:",e);
    res.redirect('/');
  }
});

/*
========================================
    ERROR
=========================================
*/

app.get('/error', (req, res) => {
  res.render('./error/error.ejs');
});
// connect port
app.listen(PORT, () => {
  console.log("success");
});