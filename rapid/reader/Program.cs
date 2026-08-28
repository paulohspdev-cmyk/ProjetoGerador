using System.Globalization;
using System.Text.Json;
using System.Xml;
using Scada.Client;
using Scada.Data.Models;

if (args.Length < 2)
{
    Console.Error.WriteLine("Uso: RcRapidReader <ScadaCommConfig.xml> <canal> [canal...] | current <canal...> | trend <archiveBit> <canal> <inicio-ISO> <fim-ISO>");
    return 2;
}

try
{
    string configFile = args[0];

    XmlDocument xmlDoc = new XmlDocument();
    xmlDoc.Load(configFile);
    XmlNode connNode = xmlDoc.SelectSingleNode("/ScadaCommConfig/ConnectionOptions")
        ?? throw new Exception("ConnectionOptions não encontrado no ScadaCommConfig.xml");

    ConnectionOptions options = new ConnectionOptions();
    options.LoadFromXml(connNode);
    ScadaClient client = new ScadaClient(options);

    if (string.Equals(args[1], "trend", StringComparison.OrdinalIgnoreCase))
    {
        if (args.Length != 6)
        {
            Console.Error.WriteLine("Uso: RcRapidReader <config> trend <archiveBit> <canal> <inicio-ISO> <fim-ISO>");
            return 2;
        }

        int archiveBit = int.Parse(args[2], CultureInfo.InvariantCulture);
        int cnlNum = int.Parse(args[3], CultureInfo.InvariantCulture);
        DateTime start = DateTime.Parse(args[4], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind).ToUniversalTime();
        DateTime end = DateTime.Parse(args[5], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind).ToUniversalTime();
        if (end <= start)
            throw new Exception("Intervalo de tendência inválido");

        Trend trend = client.GetTrend(archiveBit, new TimeRange(start, end, true), cnlNum);
        var points = trend.Points.Select(p => new
        {
            timestamp = p.Timestamp.ToUniversalTime().ToString("O"),
            val = p.Val,
            stat = p.Stat,
            defined = p.Stat > 0
        }).ToArray();

        Console.WriteLine(JsonSerializer.Serialize(new
        {
            ok = true,
            archive_bit = archiveBit,
            cnl = cnlNum,
            start = start.ToString("O"),
            end = end.ToString("O"),
            points
        }));
        return 0;
    }

    int firstChannelArg = string.Equals(args[1], "current", StringComparison.OrdinalIgnoreCase) ? 2 : 1;
    if (args.Length <= firstChannelArg)
    {
        Console.Error.WriteLine("Informe pelo menos um canal");
        return 2;
    }

    int[] cnlNums = args.Skip(firstChannelArg).Select(int.Parse).ToArray();
    var data = client.GetCurrentData(cnlNums, false, out long listId);

    var channels = cnlNums.Select((cnl, i) => new
    {
        cnl,
        val = data[i].Val,
        stat = data[i].Stat,
        defined = data[i].IsDefined
    }).ToArray();

    Console.WriteLine(JsonSerializer.Serialize(new
    {
        ok = true,
        list_id = listId,
        channels
    }));
    return 0;
}
catch (Exception ex)
{
    Console.Error.WriteLine(JsonSerializer.Serialize(new
    {
        ok = false,
        error = ex.Message,
        type = ex.GetType().FullName
    }));
    return 1;
}
