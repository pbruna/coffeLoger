dgram = require('dgram')
url_object = require('url')
mongoose = require('mongoose')
mongo = require('mongodb')
net = require('net')

# TODO: Move variables to config file
server_address = '127.0.0.1'
server_port = 514 # Requiere permisos root
db_host = '127.0.0.1'
db_port = mongo.Connection.DEFAULT_PORT
db_name = 'squid'


# FROM HERE IS NOT CONFIG 
dashboards_types = ["domain", "host", "user", "mime"]

# Db setup
db = new mongo.Db db_name, new mongo.Server(db_host, db_port, {}), {native_parser:true}
db.open (err) ->
	logger err


# Inicializamos nuesto sysLog
server = dgram.createSocket "udp4"

server.on "message", (msg, rinfo) ->
	request = parseLog "#{msg}"
	recordRequest request if request.domain?
	

server.on "listening", ->
	address = server.address()
	
	# Now connect to MongoDB
	# TODO: cambiar host y db_name a config_file
	
	console.log "server listening #{address.address}:#{address.port}"

server.bind(server_port)


# Funcion de registro en DB
recordRequest = (request) ->
		recordDashboard request
		recordRequests request

# Funciones de Ayuda para leer entrada Syslog
parseLog = (msg) ->
	new_msg = msg.replace /^<.*>/g, ""
	squidParser(new_msg.replace /(\n|\r)+$/, '')
	
squidParser = (log) ->
	[month, day, time, server, pid, epoch, duration, host, result, bytes, verb, url, user, access, mime] = log.split /\s+/g
	year = new Date().getFullYear()
	
	try
		urlStr = url_object.parse(url)
		request = 
			year: year
			date: new Date("#{month} #{day} #{year} #{time}")
			proxy_server: server
			pid: pid
			epoch: epoch
			bytes: bytes
			host: host
			hit: getHitMiss(result)
			http_verb: verb
			url: url
			domain: getDomain(urlStr.hostname)
			user: user
			access: access
			mime: mime
	catch error
		return false

# TODO: Si es ip se debe devolver la IP
getDomain = (hostname) ->
	array = hostname.split /\./g
	unless net.isIP(hostname)
		domain = "#{array[array.length-2]}.#{array[array.length-1]}"
	else
	    hostname

getHitMiss = (result) ->
	if result.match /HIT/ig then 1 else 0


# TODO: Mover a otro archivo

# Graba los datos de dashboard
recordDashboard = (request) ->
	db.collection 'dashboardstats', (err, collection) ->
		console.warn("#{err.message}") if err
		for dashboard_type in dashboards_types
			name_value = Object.getOwnPropertyDescriptor(request, "#{dashboard_type}").value
			collection.update {type: dashboard_type, name: name_value}, 
			{$inc: { 
					requests: 1, 
					bytes: parseInt(request.bytes),
					hit: parseInt(request.hit)
					} 
					}, {upsert: true}, (err) ->
						logger(err)

recordRequests = (request) ->
	db.collection 'requests', (err, collection) ->
		console.warn("#{err.message}") if err
		collection.insert {
			'proxy_server': request.proxy_server,
			'date': request.date,
			'epoch': parseFloat(request.epoch),
			'bytes': parseInt(request.bytes),
			'src_host': request.host,
			'hit': parseInt(request.hit),
			'request_method': request.http_verb,
			'url': request.url,
			'domain': request.domain,
			'access': request.access,
			'mime': request.mime
		}, (err) ->
			logger(err)
				
logger = (err) ->
	console.warn("El error es #{err.message}") if err