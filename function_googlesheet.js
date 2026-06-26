function guardarDatosYPrepararAutocrat() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. DEFINIR HOJAS
    var hojaOrigen = ss.getSheetByName("Cargar datos");  // Formulario de carga
    var hojaDestino = ss.getSheetByName("Tabla");        // Historial acumulativo

    // 2. EXTRAER ABSOLUTAMENTE TODOS LOS DATOS DE LA HOJA DE CARGA (NUEVAS POSICIONES)
    var totalAereo = hojaOrigen.getRange(2, 3).getValue();        // Celda C2 (Aereo)
    var feeAereo = hojaOrigen.getRange(3, 3).getValue();          // Celda C3 (Fee aereo)
    var traslados = hojaOrigen.getRange(4, 3).getValue();         // Celda C4 (Traslados)

    // Extracción de equipaje (Fila 6 correspondientes al Vuelo IDA, Columnas C, D, E)
    var articuloPersonal = hojaOrigen.getRange(6, 3).getValue(); // Celda C6 (Articulo Personal)
    var carryOn = hojaOrigen.getRange(6, 4).getValue();          // Celda D6 (Carry-on)
    var valijaGrande = hojaOrigen.getRange(6, 5).getValue();      // Celda E6 (Valija Grande)

    // ==========================================================
    // EXTRACCIÓN: Datos de Hoteles y sus Costos (Columna H)
    // ==========================================================
    // Hotel 1 (Fila 10)
    var hotel1_nombre = hojaOrigen.getRange("B10").getValue();
    var hotel1_descripcion = hojaOrigen.getRange("C10").getValue();
    var hotel1_estrellasRaw = hojaOrigen.getRange("D10").getValue();
    var hotel1_regimen = hojaOrigen.getRange("E10").getValue();
    var hotel1_dormitorios = hojaOrigen.getRange("F10").getValue();
    var hotel1_costo = hojaOrigen.getRange("H10").getValue();       // Celda H10 (Costo Total Hotel 1)

    // Hotel 2 (Fila 11)
    var hotel2_nombre = hojaOrigen.getRange("B11").getValue();
    var hotel2_descripcion = hojaOrigen.getRange("C11").getValue();
    var hotel2_estrellasRaw = hojaOrigen.getRange("D11").getValue();
    var hotel2_regimen = hojaOrigen.getRange("E11").getValue();
    var hotel2_dormitorios = hojaOrigen.getRange("F11").getValue();
    var hotel2_costo = hojaOrigen.getRange("H11").getValue();       // Celda H11 (Costo Total Hotel 2)

    // Hotel 3 (Fila 12)
    var hotel3_nombre = hojaOrigen.getRange("B12").getValue();
    var hotel3_descripcion = hojaOrigen.getRange("C12").getValue();
    var hotel3_estrellasRaw = hojaOrigen.getRange("D12").getValue();
    var hotel3_regimen = hojaOrigen.getRange("E12").getValue();
    var hotel3_dormitorios = hojaOrigen.getRange("F12").getValue();
    var hotel3_costo = hojaOrigen.getRange("H12").getValue();       // Celda H12 (Costo Total Hotel 3)

    // Datos generales
    var pasajero = hojaOrigen.getRange(14, 3).getValue();         // Celda C14 (Pasajero)

    // Suma automática de pasajeros (Fila 16)
    var cantPasajeros = (Number(hojaOrigen.getRange("D16").getValue()) || 0) +
        (Number(hojaOrigen.getRange("E16").getValue()) || 0) +
        (Number(hojaOrigen.getRange("F16").getValue()) || 0);

    var destino = hojaOrigen.getRange(17, 3).getValue().toString().toUpperCase();         // Celda C17 (Destino)
    var salidaDesde = hojaOrigen.getRange(18, 3).getValue();      // Celda C18 (Salida desde)
    var fechaSalida = hojaOrigen.getRange(19, 3).getValue();      // Celda C19 (Salida Fecha)

    var fechaIda = hojaOrigen.getRange(20, 3).getValue();         // Celda C20 (Fecha vuelo IDA)
    var fechaVuelta = hojaOrigen.getRange(21, 3).getValue();      // Celda C21 (Fecha vuelo VUELTA)

    // Validar que al menos haya un nombre de pasajero para evitar filas vacías
    if (!pasajero) {
        SpreadsheetApp.getUi().alert("Por favor, ingresa el nombre del pasajero antes de guardar.");
        return;
    }

    // 3. GENERAR LOS CAMPOS CALCULADOS NUEVOS
    var fechaActual = new Date(); // NOW()

    // Formatear la fecha como "YYYY-MM-d_HH_mm_ss"
    var fechaFormateadaId = Utilities.formatDate(fechaActual, ss.getSpreadsheetTimeZone(), "yyyy-MM-d_HH_mm_ss");

    // Título viaje: ÚNICAMENTE el destino en mayúsculas
    var tituloViaje = destino ? destino.toString().toUpperCase() : "";

    // Función interna para dar formato visual a las estrellas
    function formatearEstrellas(valor) {
        if (!valor) return "";
        var num = parseInt(valor.toString().replace(/\D/g, ""), 10);
        if (num == 3) return "★★★☆☆";
        if (num == 4) return "★★★★☆";
        if (num == 5) return "★★★★★";
        return valor.toString();
    }

    var hotel1_estrellas = formatearEstrellas(hotel1_estrellasRaw);
    var hotel2_estrellas = formatearEstrellas(hotel2_estrellasRaw);
    var hotel3_estrellas = formatearEstrellas(hotel3_estrellasRaw);

    // Calcular automáticamente la cantidad de noches de alojamiento
    var nochesAlojamiento = "0 noches";
    if (fechaIda && fechaVuelta) {
        var checkIn = new Date(fechaIda);
        var checkOut = new Date(fechaVuelta);
        var diferenciaMilisegundos = Math.abs(checkOut - checkIn);
        var numeroNoches = Math.ceil(diferenciaMilisegundos / (1000 * 60 * 60 * 24));
        nochesAlojamiento = numeroNoches + " noches";
    }

    // Formatear destino con mayúscula solo al principio de cada palabra
    var destinoFormateado = hojaOrigen.getRange(17, 3).getValue().toString().toLowerCase().split(' ').map(function (palabra) {
        return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    }).join(' ');

    // Variable DETALLE AEREO actualizada
    var detalleAereo = nochesAlojamiento + " noches en " + destinoFormateado + " para " + cantPasajeros + (cantPasajeros === 1 ? " pasajero" : " pasajeros");

    var detalleVuelos = "Vuelos desde " + salidaDesde + " a " + destino + " para " + cantPasajeros + ".";

    var nombresHotelesActivos = [];
    if (hotel1_nombre) nombresHotelesActivos.push(hotel1_nombre);
    if (hotel2_nombre) nombresHotelesActivos.push(hotel2_nombre);
    if (hotel3_nombre) nombresHotelesActivos.push(hotel3_nombre);
    var detalleHotel = "Estadía en " + destinoFormateado + " por " + nochesAlojamiento + ".";

    // Variable Propuesta estructurada
    var fechaSalidaFormateada = fechaSalida;
    if (fechaSalida instanceof Date) {
        fechaSalidaFormateada = Utilities.formatDate(fechaSalida, ss.getSpreadsheetTimeZone(), "dd/MM/yyyy");
    }
    var propuesta = "Propuesta para " + pasajero + " con salida el " + fechaSalidaFormateada + ".";

    var gastosIva = 0;
    var totalViaje = (Number(totalAereo) || 0) + (Number(feeAereo) || 0) + (Number(traslados) || 0) + (Number(hotel1_costo) || 0);

    // 4. ESTRUCTURAR LA FILA COMPLETA PARA EL APPEND (Se insertaron los costos en cada hotel)
    var nuevaFila = [
        fechaActual,         // Columna A: FECHA REGISTRO
        fechaFormateadaId,   // Columna B: ID FECHA REGISTRO
        pasajero,            // Columna C: PASAJERO
        tituloViaje,         // Columna D: TITULO VIAJE
        detalleAereo,        // Columna E: DETALLE AEREO
        detalleHotel,        // Columna F: DETALLE HOTEL
        propuesta,           // Columna G: PROPUESTA
        cantPasajeros,       // Columna H: CANTIDAD PASAJEROS
        destino,             // Columna I: DESTINO
        salidaDesde,         // Columna J: SALIDA DESDE
        totalAereo,          // Columna K: TOTAL AEREO
        feeAereo,            // Columna L: FEE AEREO
        hotel1_costo,        // Columna M: COSTO HOTEL (Usa el valor base del Hotel 1)
        traslados,           // Columna N: TRASLADOS
        gastosIva,           // Columna O: GASTOS + IVA
        totalViaje,          // Columna P: TOTAL VIAJE
        fechaIda,            // Columna Q: FECHA VUELO IDA
        fechaVuelta,         // Columna R: FECHA VUELO VUELTA

        // HOTEL 1
        hotel1_nombre,       // Columna S: HOTEL 1 NOMBRE
        hotel1_descripcion,  // Columna T: HOTEL 1 DESCRIPCION
        hotel1_estrellas,    // Columna U: HOTEL 1 ESTRELLAS
        nochesAlojamiento,   // Columna V: NOCHES ALOJAMIENTO
        hotel1_dormitorios,  // Columna W: HOTEL 1 DORMITORIOS
        hotel1_regimen,      // Columna X: HOTEL 1 REGIMEN
        hotel1_costo,        // Columna Y: HOTEL 1 COSTO (¡Nuevo!)

        detalleVuelos,       // Columna Z: DETALLE VUELOS TRADICIONAL

        // HOTEL 2
        hotel2_nombre,       // Columna AA: HOTEL 2 NOMBRE
        hotel2_descripcion,  // Columna AB: HOTEL 2 DESCRIPCION
        hotel2_estrellas,    // Columna AC: HOTEL 2 ESTRELLAS
        hotel2_regimen,      // Columna AD: HOTEL 2 REGIMEN
        hotel2_dormitorios,  // Columna AE: HOTEL 2 DORMITORIOS
        hotel2_costo,        // Columna AF: HOTEL 2 COSTO (¡Nuevo!)

        // HOTEL 3
        hotel3_nombre,       // Columna AG: HOTEL 3 NOMBRE
        hotel3_descripcion,  // Columna AH: HOTEL 3 DESCRIPCION
        hotel3_estrellas,    // Columna AI: HOTEL 3 ESTRELLAS
        hotel3_regimen,      // Columna AJ: HOTEL 3 REGIMEN
        hotel3_dormitorios,  // Columna AK: HOTEL 3 DORMITORIOS
        hotel3_costo         // Columna AL: HOTEL 3 COSTO (¡Nuevo!)
    ];

    // 5. GUARDAR LOS DATOS EN LA TABLA
    hojaDestino.appendRow(nuevaFila);

    // Mensaje de éxito en pantalla
    SpreadsheetApp.getUi().alert("Datos guardados con éxito en la tabla histórica.");
}