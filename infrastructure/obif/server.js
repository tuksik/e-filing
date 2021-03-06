var express = require('express');
var basicAuth = require('basic-auth-connect');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var http = require('http');
var config = require('./config.json');
var querystring = require('querystring');


function getToken() {
    var bonita_post_data=querystring.stringify({
     username: config.bonita_user,
     password: config.bonita_password,
     redirect: false
   });
    var bonita_post_options = {
      host: config.bonita_host,
      port: config.bonita_port,
      path: '/bonita/loginservice',
      method: 'POST',
      headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(bonita_post_data)
      }
    };

  return new Promise(function(resolve, reject){
  // Set up the request
  var post_req = http.request(bonita_post_options, function(res) {
	var setcookie = res.headers["set-cookie"];
    if ( setcookie ) {	
      setcookie.forEach(
        function ( cookiestr ) {  
           if (cookiestr.startsWith('X-Bonita-API-Token'))  {
              const regex = /^X-Bonita-API-Token=(\S{8}-\S{4}-\S{4}-\S{4}-\S{12});\sPath=(\/|\/bonita)$/gm;
               let m;
              while ((m = regex.exec(cookiestr)) !== null) {
                 // This is necessary to avoid infinite loops with zero-width matches
                if (m.index === regex.lastIndex) {
                    regex.lastIndex++;
                    }
                     //m[1] holds token, setcookie have all cookies 
                     resolve([m[1],setcookie])//F@Bonita you need JSESSION id also....
                     }
	       }
        }
      );
    }
  });
post_req.on('error', function(e) {
  console.log('problem with request: ' + e.message);
  reject(e);
});

// post the data
post_req.write(bonita_post_data);
post_req.end();
})
}

function getProcessIDbyName(processName,token,cookies){
    var bonita_post_options = {
        host: config.bonita_host,
        port: config.bonita_port,
        path: '/bonita/API/bpm/process?s='+processName,
        method: 'GET',
        headers: {
           'Cookie': cookies,
           'X-Bonita-API-Token': token,
          }
       };
  return new Promise(function(resolve, reject){
   http.get(bonita_post_options,(get_req)=>{
	  let data = ''; 
	  get_req.on('data', function (chunk) {
		   data += chunk;
          });     
      get_req.on('end', function() {    
          var jo = JSON.parse(data);
           if (typeof jo !== 'undefined' && jo.length > 0) {
               resolve(jo[0].id);
            }
           else reject({error:"no process",process_name:processName});
          }); 
	  get_req.on('error', function(e) {
          console.log('problem with request: ' + e.message);
          reject(e);
          });
	     });	
     });
}
/**********************************************************************/
function getActivityStateByProcessId(processInstanceId,token,cookies){
    var bonita_post_options = {
        host: config.bonita_host,
        port: config.bonita_port,
        path: '/bonita/API/bpm/activity?p=0&c=10&f=parentCaseId%3d'+processInstanceId,//Wait For Aprove
        method: 'GET',
        headers: {
           'Cookie': cookies,
           'X-Bonita-API-Token': token,
          }
       };
  return new Promise(function(resolve, reject){
   http.get(bonita_post_options,(get_req)=>{
	   let data = '';
	  get_req.on('data', function (chunk) {
		  	 data += chunk;	  
          });
           get_req.on('end', function() {
		   var jo = JSON.parse(data)         
           if (typeof jo !== 'undefined' && jo.length > 0) {
               resolve(jo[0].state);
            }
              else reject({error:"no activity",processInstanceId:processInstanceId});
            });
	   get_req.on('error', function(e) {
          console.log('problem with request: ' + e.message);
          reject(e);
          });
	     });	
     });
}


function startProcessWithData(token,cookies,pid,body){ 
  var bonita_post_data= JSON.stringify(body);
  var bonita_post_options = {
      host: config.bonita_host,
      port: config.bonita_port,    
      path: '/bonita/API/bpm/process/'+pid+'/instantiation',
      method: 'POST',
      headers: {
          'Cookie': cookies,
          'X-Bonita-API-Token': token,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bonita_post_data,'utf8')
      }
  };
  console.log("Start process with pid:"+pid+" with data: "+bonita_post_data);
  return new Promise(function(resolve, reject){
  // Set up the request
  var post_req = http.request(bonita_post_options, function(res) {
    res.setEncoding('utf8');
      res.on('data', function (chunk) {
          resolve(chunk);
      });
      res.on('end', function () {
         // console.log(res);
      });
   });
   post_req.on('error', function(e) {
         console.log('problem with request: ' + e.message);
         reject(e);
   });      
   // post the data
  post_req.write(bonita_post_data);
  post_req.end();
 });
}

// Create our application.
var app = express();

// Add Middleware necessary for REST API's
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(methodOverride('X-HTTP-Method-Override'));

// Add Basic authentication to our API.
app.use(basicAuth(config.username, config.password));

// Handle the request to start submission review.
app.post('/start/retrievesubmition', function(req, res) {
    getToken().then(function(tokenData){
	   var token=tokenData[0];
	   var cookies=tokenData[1];
	   getProcessIDbyName("RetrieveSubmission",token,cookies).then(function(pid){
	   var body={
		    submission_id:req.body.submission._id,
		    form_id:req.body.submission.form
	      }
	      startProcessWithData(token,cookies,pid,body).then(function(result){	   
		  res.send(result);
	    });
	   }, function(err) {
           console.log(err);
           res.send(err);
        });
	  }, function(err) {
        console.log(err);
        res.send(err);
      })
});

//The aplication payment is complete
app.post('/send/payment', function(req, res) {
  getToken().then(function(tokenData){
	   var token=tokenData[0];
	   var cookies=tokenData[1];
	   getProcessIDbyName("SubmissionPayment",token,cookies).then(function(pid){
	   var body={
		    submission_id:req.body.submission._id,
		    form_id:req.body.submission.form,
		    payment_id:req.body.payment.id
	      }
	      startProcessWithData(token,cookies,pid,body).then(function(result){	   
		  res.send(result);   
	    });
	   }, function(err) {
           console.log(err);
           res.send(err);
        });
	  }, function(err) {
        console.log(err);
        res.send(err);
      })
});

//The payment is complete
app.post('/send/finalpayment', function(req, res) {
  getToken().then(function(tokenData){
	   var token=tokenData[0];
	   var cookies=tokenData[1];
	   getProcessIDbyName("FinalPayment",token,cookies).then(function(pid){
	   var body={
		    submission_id:req.body.submission._id,
		    form_id:req.body.submission.form,
		    payment_id:req.body.payment.id
	      }
	      startProcessWithData(token,cookies,pid,body).then(function(result){	   
		  res.send(result);   
	    });
	   }, function(err) {
           console.log(err);
           res.send(err);
        });
	  }, function(err) {
        console.log(err);
        res.send(err);
      })
});

//aplicant aproves the submission 
app.post('/start/aplicantaprove', function(req, res) {
    getToken().then(function(tokenData){
	   var token=tokenData[0];
	   var cookies=tokenData[1];
	   getProcessIDbyName("AplicantAprove",token,cookies).then(function(pid){
	   var body={
		    submission_id:req.body.submission._id,
		    form_id:req.body.submission.form,
		    aplicant_Email:req.body.aplicant.email
	      }
	      startProcessWithData(token,cookies,pid,body).then(function(result){	   
		  res.send(result);
	    });
	   }, function(err) {
           console.log(err);
           res.send(err);
        });
	  }, function(err) {
        console.log(err);
        res.send(err);
      })
});

//aplicant already have aprove the submission 
app.get('/check/aplicantcanaprove', function(req, res) {
    getToken().then(function(tokenData){
	   var token=tokenData[0];
	   var cookies=tokenData[1];
	    getActivityStateByProcessId(req.query.processInstanceId,token,cookies).then(function(state){
	     res.send(state);
	    }, function(err) {
           console.log(err);
           res.send(err);
        });
	  }, function(err) {
        console.log(err);
        res.send(err);
      })
});

// Handle the requests for registration.
app.post('/user/registration', function(req, res) {
    getToken().then(function(tokenData){
	   var token=tokenData[0];
	   var cookies=tokenData[1];

	   getProcessIDbyName("efilingVerificationEmails",token,cookies).then(function(pid){   
	   var body={
		    submission_id:req.body.submission._id,
		    form_id:req.body.submission.form,
		    plain:req.body.submission.data.gsis.plain
	      }
	      startProcessWithData(token,cookies,pid,body).then(function(result){	   
		  res.send(result);
	    });
	   }, function(err) {
           console.log(err);
           res.send(err);
        });
        
        
	  }, function(err) {
        console.log(err);
        res.send(err);
      })

});

//handle email validation
app.post('/user/validate/email', function(req, res) {
    getToken().then(function(tokenData){
	   var token=tokenData[0];
	   var cookies=tokenData[1];
	   getProcessIDbyName("efilingValidateEmail",token,cookies).then(function(pid){
	   var body={
		      submission_id:req.body.submission._id,
		      form_id:req.body.submission.form,
		      identification_method:req.body.submission.identification_method,
		      email:req.body.submission.email,
		      plain:req.body.submission.plain
	      }
	      startProcessWithData(token,cookies,pid,body).then(function(result){	   
		  res.send(result);
	    });
	   }, function(err) {
           console.log(err);
           res.send(err);
        });
	  }, function(err) {
        console.log(err);
        res.send(err);
      })

});


/*For development*/
app.post('/start/foldercreation', function(req, res) {
    getToken().then(function(tokenData){
	   var token=tokenData[0];
	   var cookies=tokenData[1];
	   getProcessIDbyName("FoldersCreation",token,cookies).then(function(pid){
	   var body={
		    submission_id:req.body.submission._id,
		    form_id:req.body.submission.form
	      }
	      startProcessWithData(token,cookies,pid,body).then(function(result){	   
		  res.send(result);
	    });
	   }, function(err) {
           console.log(err);
           res.send(err);
        });
	  }, function(err) {
        console.log(err);
        res.send(err);
      })
});

app.post('/start/uploadfilestoprotocol', function(req, res) {
    getToken().then(function(tokenData){
	   var token=tokenData[0];
	   var cookies=tokenData[1];
	   getProcessIDbyName("UploadFilesToProtocol",token,cookies).then(function(pid){
	   var body={
		    submission_id:req.body.submission._id,
		    form_id:req.body.submission.form
	      }
	      startProcessWithData(token,cookies,pid,body).then(function(result){	   
		  res.send(result);
	    });
	   }, function(err) {
           console.log(err);
           res.send(err);
        });
	  }, function(err) {
        console.log(err);
        res.send(err);
      })
});



console.log('Listening to port ' + config.port);
app.listen(config.port);
